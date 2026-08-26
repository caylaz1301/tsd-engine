"""
inspector.py -- M1: memetakan struktur nyata dokumen TSD.

Tidak mengekstrak apa pun ke database. Hanya melaporkan:
heading, gambar (+caption/alt/ukuran), tabel (+header), dan lokasi nama SP.

Pemakaian:
    python app/parsers/inspector.py samples
    python app/parsers/inspector.py samples/NAMA_FILE.docx
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

EMU_PER_INCH = 914400

SP_RE = re.compile(r"\b(?:sp|usp|proc|prc)_[A-Za-z0-9_]+\b", re.IGNORECASE)
CAPTION_RE = re.compile(r"^\s*(gambar|figure|fig\.?|tabel|table|diagram)\b", re.IGNORECASE)
HEADING_STYLE_RE = re.compile(r"heading|judul|kop|title", re.IGNORECASE)


# ---------------------------------------------------------------- helper XML

def _text(el) -> str:
    return "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()


def _pstyle(p):
    pPr = p.find(qn("w:pPr"))
    if pPr is None:
        return None
    st = pPr.find(qn("w:pStyle"))
    return st.get(qn("w:val")) if st is not None else None


def _outline_level(p):
    pPr = p.find(qn("w:pPr"))
    if pPr is None:
        return None
    ol = pPr.find(qn("w:outlineLvl"))
    if ol is None or ol.get(qn("w:val")) is None:
        return None
    try:
        return int(ol.get(qn("w:val")))
    except ValueError:
        return None


def _all_runs_bold(p) -> bool:
    """Deteksi heading manual: paragraf pendek yang seluruh teksnya bold."""
    txt = _text(p)
    if not txt or len(txt) > 120:
        return False
    found = False
    for r in p.findall(qn("w:r")):
        if not _text(r):
            continue
        rPr = r.find(qn("w:rPr"))
        b = rPr.find(qn("w:b")) if rPr is not None else None
        if b is None or b.get(qn("w:val")) in ("0", "false"):
            return False
        found = True
    return found


def _images_in(el, rels):
    """Ambil semua gambar di dalam sebuah elemen, lengkap dengan metadata."""
    out = []
    seen = set()
    for blip in el.iter(qn("a:blip")):
        rid = blip.get(qn("r:embed")) or blip.get(qn("r:link"))
        node = id(blip)
        if node in seen:
            continue
        seen.add(node)

        cx = cy = 0
        name = descr = None
        anc = blip.getparent()
        while anc is not None:
            if anc.tag in (qn("wp:inline"), qn("wp:anchor")):
                ext = anc.find(qn("wp:extent"))
                if ext is not None:
                    cx = int(ext.get("cx") or 0)
                    cy = int(ext.get("cy") or 0)
                docpr = anc.find(qn("wp:docPr"))
                if docpr is not None:
                    name = docpr.get("name")
                    descr = docpr.get("descr")
                break
            anc = anc.getparent()

        ext_name = None
        if rid and rid in rels:
            try:
                ext_name = Path(str(rels[rid].partname)).suffix.lstrip(".")
            except Exception:
                ext_name = None

        out.append({
            "rid": rid,
            "width_in": round(cx / EMU_PER_INCH, 2) if cx else None,
            "height_in": round(cy / EMU_PER_INCH, 2) if cy else None,
            "shape_name": name,
            "alt_text": descr,
            "file_ext": ext_name,
        })
    return out


def _table_info(tbl):
    rows = tbl.findall(qn("w:tr"))
    header = [_text(c) for c in rows[0].findall(qn("w:tc"))] if rows else []
    return {"row_count": len(rows), "col_count": len(header), "header": header}


# --------------------------------------------------------------------- inti

def inspect(path: Path) -> dict:
    doc = Document(str(path))
    rels = doc.part.related_parts

    items = []
    for child in doc.element.body.iterchildren():
        tag = child.tag.split("}")[-1]

        if tag == "p":
            style = _pstyle(child)
            outline = _outline_level(child)
            by_style = bool(style and HEADING_STYLE_RE.search(style))
            by_outline = outline is not None and outline < 9
            by_bold = _all_runs_bold(child)
            items.append({
                "kind": "paragraph",
                "text": _text(child),
                "style": style,
                "outline": outline,
                "heading_by_style": by_style,
                "heading_by_outline": by_outline,
                "heading_by_bold": by_bold,
                "images": _images_in(child, rels),
            })

        elif tag == "tbl":
            info = _table_info(child)
            info["kind"] = "table"
            info["images"] = _images_in(child, rels)
            items.append(info)

        elif tag == "sdt":
            items.append({
                "kind": "content_control",
                "text": _text(child)[:300],
                "images": _images_in(child, rels),
            })

    # --- tentukan heading & propagasi section ---
    style_headings = sum(
        1 for i in items
        if i.get("heading_by_style") or i.get("heading_by_outline")
    )
    use_bold_fallback = style_headings < 3

    current = "(sebelum heading pertama)"
    for it in items:
        if it["kind"] == "paragraph":
            is_head = it["heading_by_style"] or it["heading_by_outline"]
            if not is_head and use_bold_fallback:
                is_head = it["heading_by_bold"]
            if is_head and it["text"]:
                current = it["text"]
                it["is_heading"] = True
        it["section"] = current

    # --- caption gambar ---
    for idx, it in enumerate(items):
        if not it.get("images"):
            continue
        cap = it.get("text") or ""
        if not cap:
            for j in range(idx + 1, min(idx + 3, len(items))):
                nxt = items[j]
                if nxt["kind"] != "paragraph":
                    continue
                t = nxt.get("text") or ""
                if t and (CAPTION_RE.match(t) or len(t) < 100):
                    cap = t
                    break
        it["caption"] = cap

    # --- nama SP ---
    sp_hits = {}
    for it in items:
        blob = it.get("text") or ""
        if it["kind"] == "table":
            blob += " " + " ".join(it["header"])
        for m in SP_RE.findall(blob):
            sp_hits.setdefault(m.lower(), set()).add(it["section"])

    return {
        "file": path.name,
        "items": items,
        "sp_hits": {k: sorted(v) for k, v in sp_hits.items()},
        "heading_detection": "style/outline" if not use_bold_fallback else "BOLD FALLBACK",
        "style_heading_count": style_headings,
    }


def report(data: dict) -> None:
    items = data["items"]
    bar = "=" * 78
    print("")
    print(bar)
    print("FILE: " + data["file"])
    print(bar)
    print("Metode deteksi heading : " + data["heading_detection"])
    print("Heading via style      : %d" % data["style_heading_count"])

    headings = [i for i in items if i.get("is_heading")]
    images = [(i, img) for i in items for img in i.get("images", [])]
    tables = [i for i in items if i["kind"] == "table"]

    print("Total heading          : %d" % len(headings))
    print("Total gambar           : %d" % len(images))
    print("Total tabel            : %d" % len(tables))
    print("Nama SP unik           : %d" % len(data["sp_hits"]))

    print("\n--- HEADING (%d) ---" % len(headings))
    for h in headings:
        print("  [%s|outline=%s] %s" % (
            h.get("style") or "no-style", h.get("outline"), h["text"]))

    print("\n--- GAMBAR (%d) ---" % len(images))
    for n, pair in enumerate(images, 1):
        it, img = pair
        if img["width_in"]:
            size = "%sx%sin" % (img["width_in"], img["height_in"])
        else:
            size = "?"
        print("  #%d [%s] .%s" % (n, size, img["file_ext"]))
        print("      section : %s" % it["section"])
        print("      caption : %s" % (it.get("caption") or "(TIDAK ADA)"))
        print("      alt     : %s" % (img["alt_text"] or "(kosong)"))

    print("\n--- TABEL (%d) ---" % len(tables))
    for n, t in enumerate(tables, 1):
        print("  #%d %dr x %dc | section: %s" % (
            n, t["row_count"], t["col_count"], t["section"]))
        print("      header: %s" % t["header"])

    print("\n--- NAMA SP (%d) ---" % len(data["sp_hits"]))
    for sp, secs in data["sp_hits"].items():
        print("  %s" % sp)
        for s in secs:
            print("      muncul di: %s" % s)

    print("\n--- DIAGNOSA ---")
    if data["heading_detection"] != "style/outline":
        print("  ! Heading Word style tidak terpakai. Parser harus andalkan deteksi bold.")
    no_alt = [1 for _, img in images if not img["alt_text"]]
    no_caption = [1 for it, _ in images if not it.get("caption")]
    if no_caption:
        print("  ! %d gambar tanpa caption -> klasifikasi ERD/DataFlow harus dari heading." % len(no_caption))
    if images and len(no_alt) == len(images):
        print("  ! Semua gambar tanpa alt text.")
    small = [1 for _, img in images if img["width_in"] and img["width_in"] < 2.0]
    if small:
        print("  ! %d gambar berukuran < 2 inch (kemungkinan logo/ikon, perlu difilter)." % len(small))
    if not data["sp_hits"]:
        print("  ! Tidak ada nama SP terdeteksi. Pola regex perlu disesuaikan.")
    print("")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = Path(sys.argv[1])
    files = sorted(target.glob("*.docx")) if target.is_dir() else [target]
    files = [f for f in files if not f.name.startswith("~$")]

    if not files:
        print("Tidak ada file .docx di %s" % target)
        sys.exit(1)

    outdir = Path("storage/inspect")
    outdir.mkdir(parents=True, exist_ok=True)

    for f in files:
        data = inspect(f)
        report(data)
        dest = outdir / (f.stem + ".json")
        dest.write_text(
            json.dumps(data, indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        print("  -> JSON: %s\n" % dest)


if __name__ == "__main__":
    main()
