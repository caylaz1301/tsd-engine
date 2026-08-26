"""
sql_parser.py -- M3a: ekstraksi stored procedure dari script .sql SQL Server.

Menangani hal-hal nyata yang ditemukan pada dump REGLA:
  - encoding UTF-16 LE dengan BOM dan akhir baris CRLF
  - batch dipisah oleh baris "GO"
  - komentar -- dan /* */ yang banyak, termasuk kode lama yang dinonaktifkan
  - nama objek berkurung siku: [dbo].[sp_nama]
  - alias pada UPDATE ... FROM, yang kalau tidak diurai akan tercatat
    sebagai nama tabel palsu seperti "a" atau "t"

Output:
  storage/parsed/sql/<stem>.json

Pemakaian:
    python app/parsers/sql_parser.py samples
    python app/parsers/sql_parser.py samples/regla_lll_20250724.sql
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# ------------------------------------------------------------- encoding

BOMS = [
    (b"\xff\xfe\x00\x00", "utf-32-le"),
    (b"\x00\x00\xfe\xff", "utf-32-be"),
    (b"\xef\xbb\xbf", "utf-8-sig"),
    (b"\xff\xfe", "utf-16-le"),
    (b"\xfe\xff", "utf-16-be"),
]


def read_sql(path: Path) -> tuple[str, str]:
    """Baca file .sql apa pun encoding-nya. Kembalikan (teks, nama_encoding)."""
    raw = path.read_bytes()

    for bom, enc in BOMS:
        if raw.startswith(bom):
            return raw.decode(enc, errors="replace"), enc

    # Tanpa BOM: banyak nol pada posisi ganjil menandakan UTF-16 LE.
    head = raw[:4000]
    if head.count(b"\x00") > len(head) // 4:
        odd = sum(1 for i in range(1, len(head), 2) if head[i] == 0)
        enc = "utf-16-le" if odd > len(head) // 5 else "utf-16-be"
        return raw.decode(enc, errors="replace"), enc + " (tanpa BOM)"

    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace"), "latin-1 (paksa)"


# --------------------------------------------------------------- regex

IDENT = r"(?:\[[^\]]+\]|[A-Za-z_#@][\w$#]*)"

# SQL Server mengizinkan penulisan db..tabel yang berarti "skema bawaan".
# Bentuk titik-ganda ini harus dicoba lebih dulu, kalau tidak regex hanya
# menangkap nama database sehingga REGLA_STAGING..EXRATES tercatat sebagai
# tabel bernama REGLA_STAGING.
QUALIFIED = (
    r"(?:" + IDENT + r"\s*\.\s*\.\s*" + IDENT
    + r"|(?:" + IDENT + r"\s*\.\s*){0,2}" + IDENT + r")"
)

# Prosedur sistem dan pemanggilan SQL dinamis, bukan SP milik aplikasi.
SYSTEM_PROCS = {
    "sp_executesql", "sp_rename", "sp_addextendedproperty",
    "sp_updateextendedproperty", "sp_fulltext_database", "sp_help",
    "sp_helptext", "sp_who", "sp_who2", "sp_msforeachtable",
    "sp_send_dbmail", "xp_cmdshell", "sp_addrolemember",
}

# Deteksi salinan arsip. Dump produksi menyimpan banyak versi lama dengan
# akhiran tanggal, jadi tanpa penandaan ini jumlah SP jadi menggelembung.
DATE_COPY_RE = re.compile(
    r"^(?P<base>.+?)_(?P<v>\d{8}|\d{6})(?P<rest>(?:_[A-Za-z0-9]+)*)$"
)
WORD_COPY_RE = re.compile(
    r"^(?P<base>.+?)_(?P<v>debug|bak|bkp|backup|old|copy|temp|tmp|test|orig"
    r"|original)(?P<rest>(?:_[A-Za-z0-9]+)*)$",
    re.IGNORECASE,
)
TRAIL_NUM_RE = re.compile(r"^(?P<base>.+?)_(?P<v>\d{1,2})$")


def classify_name(name: str):
    """Kembalikan (nama_dasar, jenis_salinan). jenis None berarti SP utama."""
    m = DATE_COPY_RE.match(name)
    if m:
        return m.group("base"), "tanggal"
    m = WORD_COPY_RE.match(name)
    if m:
        return m.group("base"), m.group("v").lower()
    return name, None

GO_RE = re.compile(r"^\s*GO\s*(?:--.*)?$", re.IGNORECASE | re.MULTILINE)

CREATE_PROC_RE = re.compile(
    r"\bCREATE\s+(?:OR\s+ALTER\s+)?PROC(?:EDURE)?\s+(?P<full>" + QUALIFIED + r")",
    re.IGNORECASE,
)

ALTER_PROC_RE = re.compile(
    r"\bALTER\s+PROC(?:EDURE)?\s+(?P<full>" + QUALIFIED + r")", re.IGNORECASE
)

PARAM_RE = re.compile(
    r"(?P<name>@[A-Za-z_]\w*)\s+(?P<type>" + IDENT + r"(?:\s*\([^)]*\))?)",
    re.IGNORECASE,
)

SOURCE_RE = re.compile(
    r"\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*(?:OUTER\s+)?JOIN"
    r"|CROSS\s+APPLY|OUTER\s+APPLY|USING)\s+(?P<t>" + QUALIFIED + r")",
    re.IGNORECASE,
)

TARGET_PATTERNS = [
    ("insert", re.compile(r"\bINSERT\s+(?:INTO\s+)?(?P<t>" + QUALIFIED + r")", re.I)),
    ("update", re.compile(r"\bUPDATE\s+(?:TOP\s*\([^)]*\)\s*)?(?P<t>" + QUALIFIED + r")", re.I)),
    ("delete", re.compile(r"\bDELETE\s+(?:TOP\s*\([^)]*\)\s*)?(?:FROM\s+)?(?P<t>" + QUALIFIED + r")", re.I)),
    ("merge", re.compile(r"\bMERGE\s+(?:INTO\s+)?(?P<t>" + QUALIFIED + r")", re.I)),
    ("truncate", re.compile(r"\bTRUNCATE\s+TABLE\s+(?P<t>" + QUALIFIED + r")", re.I)),
]

# SELECT ... INTO ditangani terpisah. Kalau digabung ke daftar di atas,
# kata INTO pada "INSERT INTO" dan "MERGE INTO" ikut tertangkap sehingga
# satu tabel tercatat dua kali dengan operasi palsu.
SELECT_INTO_RE = re.compile(r"\bINTO\s+(?P<t>" + QUALIFIED + r")", re.IGNORECASE)
INTO_OWNER_RE = re.compile(r"\b(INSERT|MERGE)\s+INTO\b", re.IGNORECASE)

EXEC_RE = re.compile(
    r"\bEXEC(?:UTE)?\s+(?P<t>" + QUALIFIED + r")", re.IGNORECASE
)

ALIAS_RE = re.compile(
    r"\b(?:FROM|JOIN)\s+(?P<t>" + QUALIFIED + r")\s+(?:AS\s+)?(?P<a>[A-Za-z_]\w*)\b",
    re.IGNORECASE,
)

LINE_COMMENT_RE = re.compile(r"--[^\n]*")
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
STRING_RE = re.compile(r"'(?:[^']|'')*'")

SQL_KEYWORDS = {
    "select", "where", "on", "as", "set", "group", "order", "having", "join",
    "inner", "left", "right", "full", "outer", "cross", "apply", "union",
    "and", "or", "not", "in", "exists", "with", "values", "when", "then",
    "else", "end", "case", "begin", "if", "while", "declare", "top",
    "distinct", "into", "from", "update", "delete", "insert", "by", "is",
    "null", "asc", "desc", "table", "go", "exec", "execute", "return",
    "open", "close", "fetch", "next", "deallocate", "cursor", "for",
}


def strip_noise(sql: str) -> str:
    """Buang komentar dan literal string supaya tidak ikut terdeteksi."""
    s = BLOCK_COMMENT_RE.sub(" ", sql)
    s = LINE_COMMENT_RE.sub(" ", s)
    s = STRING_RE.sub("''", s)
    return s


def clean_ident(tok: str) -> str:
    parts = [p.strip() for p in tok.split(".")]
    parts = [p[1:-1] if p.startswith("[") and p.endswith("]") else p for p in parts]
    return ".".join(p for p in parts if p)


def short_name(qualified: str) -> str:
    return clean_ident(qualified).split(".")[-1]


def is_real_table(name: str) -> bool:
    if not name:
        return False
    last = name.split(".")[-1]
    if last.startswith("#") or last.startswith("@"):
        return False
    if last.lower() in SQL_KEYWORDS:
        return False
    if len(last) <= 2:
        return False
    return True


def split_header_body(batch: str):
    """Pisahkan bagian deklarasi parameter dari isi prosedur."""
    m = re.search(r"\bAS\b", batch, re.IGNORECASE)
    if not m:
        return batch, ""
    return batch[: m.start()], batch[m.end():]


def parse_batch(batch: str, offset_line: int):
    m = CREATE_PROC_RE.search(batch) or ALTER_PROC_RE.search(batch)
    if not m:
        return None

    full = clean_ident(m.group("full"))
    name = full.split(".")[-1]
    schema = full.split(".")[0] if "." in full else None

    header, body = split_header_body(batch[m.end():])
    clean_body = strip_noise(body)
    clean_header = strip_noise(header)

    params = []
    seen_p = set()
    for pm in PARAM_RE.finditer(clean_header):
        pn = pm.group("name")
        if pn.lower() in seen_p:
            continue
        seen_p.add(pn.lower())
        params.append({
            "name": pn,
            "type": re.sub(r"\s+", "", clean_ident(pm.group("type"))),
        })

    aliases = {}
    for am in ALIAS_RE.finditer(clean_body):
        a = am.group("a").lower()
        if a in SQL_KEYWORDS:
            continue
        tbl = clean_ident(am.group("t"))
        if is_real_table(tbl):
            aliases.setdefault(a, tbl)

    def resolve(tok: str) -> str:
        t = clean_ident(tok)
        low = t.lower()
        if "." not in t and low in aliases:
            return aliases[low]
        return t

    sources, temps = {}, set()
    for sm in SOURCE_RE.finditer(clean_body):
        t = clean_ident(sm.group("t"))
        last = t.split(".")[-1]
        if last.startswith("#") or last.startswith("@"):
            temps.add(last)
            continue
        if is_real_table(t):
            sources[short_name(t).lower()] = t

    targets = {}
    masked_body = INTO_OWNER_RE.sub(r"\1", clean_body)
    for kind, rx in TARGET_PATTERNS + [("select_into", SELECT_INTO_RE)]:
        scan = masked_body if kind == "select_into" else clean_body
        for tm in rx.finditer(scan):
            t = resolve(tm.group("t"))
            last = t.split(".")[-1]
            if last.startswith("#") or last.startswith("@"):
                temps.add(last)
                continue
            if not is_real_table(t):
                continue
            key = short_name(t).lower()
            entry = targets.setdefault(key, {"table": t, "operations": []})
            if kind not in entry["operations"]:
                entry["operations"].append(kind)

    calls = {}
    for em in EXEC_RE.finditer(clean_body):
        t = clean_ident(em.group("t"))
        last = short_name(t)
        low = last.lower()
        if last.startswith("@") or low in SQL_KEYWORDS or low in SYSTEM_PROCS:
            continue
        calls[low] = last

    return {
        "sp_name": name,
        "sp_name_lower": name.lower(),
        "schema": schema,
        "line": offset_line,
        "parameters": params,
        "param_count": len(params),
        "source_tables": sorted(sources.values(), key=str.lower),
        "target_tables": sorted(targets.values(), key=lambda x: x["table"].lower()),
        "temp_objects": sorted(temps, key=str.lower),
        "calls": sorted(calls.values(), key=str.lower),
        "body_lines": body.count("\n") + 1,
        "base_name": name,
        "variant": None,
    }


def parse_file(path: Path) -> dict:
    text, enc = read_sql(path)
    text = text.replace("\r\n", "\n")

    batches = []
    pos = 0
    line = 1
    for gm in GO_RE.finditer(text):
        chunk = text[pos:gm.start()]
        batches.append((chunk, line))
        line += chunk.count("\n") + 1
        pos = gm.end()
    batches.append((text[pos:], line))

    procs = []
    dupes = {}
    for chunk, ln in batches:
        d = parse_batch(chunk, ln)
        if not d:
            continue
        key = d["sp_name_lower"]
        if key in dupes:
            dupes[key] += 1
            d["duplicate_of_line"] = dupes.get("__line__" + key)
        else:
            dupes[key] = 1
            dupes["__line__" + key] = ln
        procs.append(d)

    # Penandaan salinan arsip dilakukan setelah semua SP terkumpul, karena
    # akhiran angka pendek seperti _2 hanya layak disebut salinan kalau nama
    # dasarnya benar-benar ada di file yang sama.
    names = {p["sp_name_lower"] for p in procs}
    for p in procs:
        base, kind = classify_name(p["sp_name"])
        if kind is None:
            m = TRAIL_NUM_RE.match(p["sp_name"])
            if m and m.group("base").lower() in names:
                base, kind = m.group("base"), "nomor"
        p["base_name"] = base
        p["variant"] = kind
        p["base_exists_in_file"] = (
            base.lower() in names if kind else None
        )

    db = None
    dbm = re.search(r"\bCREATE\s+DATABASE\s+(" + IDENT + r")", text, re.IGNORECASE)
    if dbm:
        db = clean_ident(dbm.group(1))

    return {
        "file": path.name,
        "encoding": enc,
        "database": db,
        "batch_count": len(batches),
        "procedure_count": len(procs),
        "procedures": procs,
    }


def report(d: dict) -> None:
    bar = "=" * 78
    print("")
    print(bar)
    print("FILE     : " + d["file"])
    print("ENCODING : " + d["encoding"])
    print("DATABASE : " + str(d["database"]))
    print(bar)
    print("Batch (GO)         : %d" % d["batch_count"])
    print("Stored procedure   : %d" % d["procedure_count"])

    procs = d["procedures"]
    no_src = [p for p in procs if not p["source_tables"]]
    no_tgt = [p for p in procs if not p["target_tables"]]
    print("Tanpa tabel sumber : %d" % len(no_src))
    print("Tanpa tabel target : %d" % len(no_tgt))

    variants = [p for p in procs if p.get("variant")]
    print("Salinan arsip      : %d" % len(variants))
    print("SP utama           : %d" % (len(procs) - len(variants)))
    if variants:
        kinds = {}
        for p in variants:
            kinds[p["variant"]] = kinds.get(p["variant"], 0) + 1
        detail = ", ".join("%s=%d" % kv for kv in sorted(kinds.items()))
        print("  rincian salinan  : %s" % detail)

    print("\n--- 15 SP UTAMA TERBESAR (salinan arsip dikecualikan) ---")
    utama = [p for p in procs if not p.get("variant")]
    for p in sorted(utama, key=lambda x: -x["body_lines"])[:15]:
        print("  %-44s %5d baris  src=%-3d tgt=%-3d param=%d" % (
            p["sp_name"][:44], p["body_lines"],
            len(p["source_tables"]), len(p["target_tables"]), p["param_count"]))

    called = {}
    for p in procs:
        for c in p["calls"]:
            called.setdefault(c.lower(), []).append(p["sp_name"])
    if called:
        print("\n--- PANGGILAN ANTAR SP (10 pertama) ---")
        for k, v in list(called.items())[:10]:
            print("  %s <- %s" % (k, ", ".join(v[:3])))
    print("")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = Path(sys.argv[1])
    files = sorted(target.glob("*.sql")) if target.is_dir() else [target]
    if not files:
        print("Tidak ada file .sql di %s" % target)
        sys.exit(1)

    out = Path("storage/parsed/sql")
    out.mkdir(parents=True, exist_ok=True)

    total = 0
    total_utama = 0
    for f in files:
        d = parse_file(f)
        total_utama += sum(1 for p in d["procedures"] if not p.get("variant"))
        report(d)
        dest = out / (f.stem + ".json")
        dest.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        print("  -> JSON: %s" % dest)
        total += d["procedure_count"]

    print("\nTOTAL stored procedure di script SQL: %d" % total)
    print("TOTAL SP utama (tanpa salinan arsip): %d" % total_utama)


if __name__ == "__main__":
    main()
