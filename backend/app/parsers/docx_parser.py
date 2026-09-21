"""
docx_parser.py -- M2: ekstraksi metadata per stored procedure dari dokumen TSD.

Output per dokumen:
  storage/parsed/<stem>.json      metadata terstruktur
  storage/images/<segment>/...    file PNG diagram ERD & Data Flow

Pemakaian:
    python app/parsers/docx_parser.py samples
    python app/parsers/docx_parser.py samples/NAMA_FILE.docx
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config as C

EMU_PER_INCH = 914400


# ------------------------------------------------------------ helper XML

def _text(el) -> str:
    return "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()


def _style(p):
    pPr = p.find(qn("w:pPr"))
    if pPr is None:
        return None
    st = pPr.find(qn("w:pStyle"))
    return st.get(qn("w:val")) if st is not None else None


def _images(el):
    out = []
    for blip in el.iter(qn("a:blip")):
        rid = blip.get(qn("r:embed")) or blip.get(qn("r:link"))
        if not rid:
            continue
        cx = cy = 0
        alt = None
        anc = blip.getparent()
        while anc is not None:
            if anc.tag in (qn("wp:inline"), qn("wp:anchor")):
                ext = anc.find(qn("wp:extent"))
                if ext is not None:
                    cx = int(ext.get("cx") or 0)
                    cy = int(ext.get("cy") or 0)
                dp = anc.find(qn("wp:docPr"))
                if dp is not None:
                    alt = dp.get("descr")
                break
            anc = anc.getparent()
        out.append({
            "rid": rid,
            "width_in": round(cx / EMU_PER_INCH, 2) if cx else None,
            "height_in": round(cy / EMU_PER_INCH, 2) if cy else None,
            "alt": alt,
        })
    return out


def _table_rows(tbl):
    rows = []
    for tr in tbl.findall(qn("w:tr")):
        rows.append([_text(tc) for tc in tr.findall(qn("w:tc"))])
    return rows


# -------------------------------------------------- pemecahan jadi section

def _sections(doc):
    """Bagi body dokumen menjadi daftar section berdasarkan heading."""
    sections = []
    cur = {
        "heading": None,
        "style": None,
        "level": None,
        "items": [],
    }

    for child in doc.element.body.iterchildren():
        tag = child.tag.split("}")[-1]

        if tag == "p":
            style = _style(child)
            level = C.HEADING_STYLE_LEVEL.get(style) if style else None
            txt = _text(child)

            if level is not None and level >= 1 and txt:
                sections.append(cur)
                cur = {
                    "heading": txt,
                    "style": style,
                    "level": level,
                    "items": [],
                }
                continue

            imgs = _images(child)
            if imgs:
                for im in imgs:
                    cur["items"].append(("image", im))
            if txt:
                cur["items"].append(("text", txt))

        elif tag == "tbl":
            cur["items"].append(("table", _table_rows(child)))
            for im in _images(child):
                cur["items"].append(("image", im))

        elif tag == "sdt":
            txt = _text(child)
            if txt:
                cur["items"].append(("text", txt[:500]))

    sections.append(cur)
    return sections


# -------------------------------------------------------- parsing heading

def parse_diagram_heading(heading: str):
    """
    Kembalikan (kind, sp_name, is_segment_summary) atau None.

    kind: "data_model" | "data_flow"
    """
    m = C.DIAGRAM_HEADING_RE.match(heading)
    if not m:
        return None

    kind_raw = re.sub(r"\s+", " ", m.group("kind")).strip().lower()
    kind = C.KIND_MAP.get(kind_raw)
    if not kind:
        return None

    rest = m.group("rest")

    if C.SEGMENT_SUMMARY_RE.search(rest):
        return (kind, None, True)

    # Segment mengandung tanda hubung, nama SP tidak. Ambil token terakhir.
    parts = [p.strip() for p in re.split("[" + C.DASH_CLASS + "]", rest)]
    parts = [p for p in parts if p]
    if not parts:
        return (kind, None, False)

    cand = parts[-1]
    tok = C.SP_TOKEN_RE.match(cand)
    if not tok:
        return (kind, None, False)

    sp = tok.group(0)
    if sp.lower() in C.SP_NAME_BLACKLIST:
        return (kind, None, False)

    return (kind, sp, False)


def segment_from_filename(stem: str) -> str:
    m = C.FILENAME_SEGMENT_RE.match(stem)
    return (m.group("segment") if m else stem).strip("_ ").upper()


def _is_diagram(img) -> bool:
    w = img.get("width_in")
    if w is not None and w < C.MIN_DIAGRAM_WIDTH_IN:
        return False
    if (img.get("alt") or "").strip().lower() == "thumbnail image":
        return False
    return True


def _explanation(items) -> str:
    texts = [v for kind, v in items if kind == "text"]
    if not texts:
        return ""
    start = 0
    for i, t in enumerate(texts):
        if C.EXPLANATION_HINT_RE.search(t):
            start = i + 1
            break
    body = [t for t in texts[start:] if len(t) > 2]
    return "\n".join(body).strip()


def _diagram_status(items, diagrams) -> str:
    """Bedakan diagram kosong dari diagram yang memang tidak disediakan."""
    if diagrams:
        return "available"
    text = " ".join(v for kind, v in items if kind == "text")
    if re.search(r"\bnot\s+available\b|\btidak\s+tersedia\b", text, re.IGNORECASE):
        return "not_available"
    return "missing"


# --------------------------------------------------------------- inti M2

def parse(path: Path, images_root: Path, segment_override: str | None = None) -> dict:
    doc = Document(str(path))
    rels = doc.part.related_parts
    segment = segment_override or segment_from_filename(path.stem)

    sections = _sections(doc)

    procs = {}
    order = []
    segment_summary = {"data_model": None, "data_flow": None}
    specs = {"source": [], "parameter": [], "target": []}
    change_control = []
    warnings = []

    # SP terakhir pada tiap level, untuk merekonstruksi hierarki panggilan.
    last_at_level = {}

    img_dir = images_root / segment

    for sec in sections:
        heading = sec["heading"] or ""
        low = heading.lower()
        items = sec["items"]

        # --- Document Change Control ---
        for kind, val in items:
            if kind != "table" or not val:
                continue
            hdr = [c.strip().lower() for c in val[0]]
            if all(h in hdr for h in C.CHANGE_CONTROL_HEADER_HINT):
                for row in val[1:]:
                    if any(c.strip() for c in row):
                        change_control.append(row)

        # --- Table Specification di Appendix ---
        spec_key = None
        for key, aliases in C.SPEC_SECTION_ALIASES.items():
            if any(a in low for a in aliases):
                spec_key = key
                break

        if spec_key:
            pending_name = None
            for kind, val in items:
                if kind == "text":
                    pending_name = val
                elif kind == "table" and val:
                    hdr = [c.strip().lower() for c in val[0]]
                    if hdr[: len(C.SPEC_TABLE_HEADER)] != C.SPEC_TABLE_HEADER:
                        continue
                    fields = [
                        {
                            "field": r[0].strip(),
                            "type": r[1].strip() if len(r) > 1 else "",
                            "description": r[2].strip() if len(r) > 2 else "",
                        }
                        for r in val[1:]
                        if r and r[0].strip()
                    ]
                    tbl_name = None
                    if pending_name:
                        label_match = C.SPEC_TABLE_LABEL_RE.search(pending_name)
                        if label_match:
                            tbl_name = label_match.group("name")
                        else:
                            tk = C.SP_TOKEN_RE.search(pending_name)
                            tbl_name = tk.group(0) if tk else pending_name[:80]
                    specs[spec_key].append({
                        "table_name": tbl_name,
                        "raw_label": pending_name,
                        "field_count": len(fields),
                        "fields": fields,
                    })
                    pending_name = None
            continue

        if any(s in low for s in C.IGNORE_SECTIONS):
            continue

        parsed = parse_diagram_heading(heading)
        if not parsed:
            continue

        kind, sp, is_summary = parsed
        diagrams = [im for kind_, im in items if kind_ == "image" and _is_diagram(im)]
        explanation = _explanation(items)

        saved = []
        for n, im in enumerate(diagrams, 1):
            part = rels.get(im["rid"])
            if part is None:
                warnings.append("gambar tidak ditemukan: rid=%s pada %s" % (im["rid"], heading))
                continue
            blob = part.blob
            ext = Path(str(part.partname)).suffix or ".png"
            base = sp or "_SEGMENT_SUMMARY"
            digest = hashlib.sha1(blob).hexdigest()[:8]
            fname = "%s__%s_%d_%s%s" % (base, kind, n, digest, ext)
            img_dir.mkdir(parents=True, exist_ok=True)
            (img_dir / fname).write_bytes(blob)
            saved.append({
                "path": "%s/%s" % (segment, fname),
                "width_in": im["width_in"],
                "height_in": im["height_in"],
            })

        payload = {
            "section": heading,
            "images": saved,
            "explanation": explanation,
            "status": _diagram_status(items, diagrams),
        }

        if is_summary:
            segment_summary[kind] = payload
            continue

        if not sp:
            warnings.append("nama SP tidak terbaca dari heading: %s" % heading)
            continue

        key = sp.lower()
        if key not in procs:
            procs[key] = {
                "sp_name": sp,
                "sp_name_lower": key,
                "segment": segment,
                "heading_level": sec["level"],
                "called_by": None,
                "data_model": None,
                "data_flow": None,
            }
            order.append(key)
        else:
            # Nama tampil boleh beda kapitalisasi; simpan yang pertama.
            procs[key]["heading_level"] = min(
                procs[key]["heading_level"] or 99, sec["level"] or 99
            )

        lvl = sec["level"] or 4
        parent = None
        for up in range(lvl - 1, 3, -1):
            if last_at_level.get(up) and last_at_level[up] != key:
                parent = last_at_level[up]
                break
        if parent and not procs[key]["called_by"]:
            procs[key]["called_by"] = parent
        last_at_level[lvl] = key
        for deeper in [k for k in last_at_level if k > lvl]:
            last_at_level[deeper] = None

        if procs[key][kind] is None:
            procs[key][kind] = payload
        else:
            procs[key][kind]["images"].extend(saved)
            if explanation and not procs[key][kind]["explanation"]:
                procs[key][kind]["explanation"] = explanation

    # --- skor kelengkapan ---
    for key in order:
        p = procs[key]
        has_m = bool(p["data_model"] and p["data_model"]["images"])
        has_f = bool(p["data_flow"] and p["data_flow"]["images"])
        if has_m and has_f:
            p["confidence"] = "high"
        elif has_m or has_f:
            p["confidence"] = "medium"
        else:
            p["confidence"] = "low"

    return {
        "file": path.name,
        "segment": segment,
        "change_control": change_control,
        "segment_summary": segment_summary,
        "procedure_count": len(order),
        "procedures": [procs[k] for k in order],
        "table_specs": {
            k: {"table_count": len(v), "tables": v} for k, v in specs.items()
        },
        "warnings": warnings,
    }


def report(d: dict) -> None:
    bar = "=" * 78
    print("")
    print(bar)
    print("FILE    : " + d["file"])
    print("SEGMENT : " + d["segment"])
    print(bar)

    procs = d["procedures"]
    high = [p for p in procs if p["confidence"] == "high"]
    med = [p for p in procs if p["confidence"] == "medium"]
    low = [p for p in procs if p["confidence"] == "low"]
    imgs = sum(
        len((p[k] or {}).get("images", []))
        for p in procs
        for k in ("data_model", "data_flow")
    )

    print("Stored procedure  : %d" % len(procs))
    print("  lengkap (high)  : %d" % len(high))
    print("  sebagian (med)  : %d" % len(med))
    print("  kosong (low)    : %d" % len(low))
    print("Diagram tersimpan : %d" % imgs)
    for key in ("source", "parameter", "target"):
        t = d["table_specs"][key]
        fields = sum(x["field_count"] for x in t["tables"])
        print("Tabel %-9s   : %d tabel / %d field" % (key, t["table_count"], fields))

    print("\n--- DAFTAR SP ---")
    for p in procs:
        nm = len((p["data_model"] or {}).get("images", []))
        nf = len((p["data_flow"] or {}).get("images", []))
        parent = " <- dipanggil oleh %s" % p["called_by"] if p["called_by"] else ""
        print("  [%-6s] %-46s model=%d flow=%d%s" % (
            p["confidence"], p["sp_name"], nm, nf, parent))

    if low:
        print("\n--- PERLU DIPERIKSA MANUAL ---")
        for p in low:
            print("  %s (tidak ada diagram terdeteksi)" % p["sp_name"])

    if d["warnings"]:
        print("\n--- WARNING ---")
        for w in d["warnings"][:20]:
            print("  ! %s" % w)
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

    images_root = Path("storage/images")
    out_dir = Path("storage/parsed")
    out_dir.mkdir(parents=True, exist_ok=True)

    grand = 0
    for f in files:
        d = parse(f, images_root)
        report(d)
        dest = out_dir / (f.stem + ".json")
        dest.write_text(
            json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print("  -> JSON: %s" % dest)
        grand += d["procedure_count"]

    print("\nTOTAL stored procedure terindeks: %d" % grand)


if __name__ == "__main__":
    main()
