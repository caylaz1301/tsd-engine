"""
build_index.py -- M3b: gabungkan hasil parser docx dan SQL ke satu indeks SQLite.

Membaca:
    storage/parsed/*.json          hasil docx_parser.py
    storage/parsed/sql/*.json       hasil sql_parser.py

Menulis:
    storage/tsd_index.db

Pencarian memakai FTS5. Tokenizer bawaan memecah underscore, jadi mengetik
"collateral" tetap menemukan sp_update_collateral_daily, sementara mengetik
nama lengkap juga cocok karena diperlakukan sebagai frasa.

Pemakaian:
    python app/indexer/build_index.py
    python app/indexer/build_index.py --cari collateral
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PARSED_DIR = Path("storage/parsed")
SQL_DIR = PARSED_DIR / "sql"
DB_PATH = Path("storage/tsd_index.db")

SCHEMA = """
PRAGMA journal_mode = WAL;

DROP TABLE IF EXISTS sp_index;
DROP TABLE IF EXISTS sp_images;
DROP TABLE IF EXISTS sp_tables;
DROP TABLE IF EXISTS spec_tables;
DROP TABLE IF EXISTS spec_fields;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS sp_fts;
DROP TABLE IF EXISTS sp_doc_occurrences;

CREATE TABLE documents (
    tsd_filename    TEXT PRIMARY KEY,
    segment         TEXT NOT NULL,
    sharepoint_url  TEXT,
    procedure_count INTEGER,
    change_control  TEXT,
    warnings        TEXT,
    indexed_at      TEXT
);

CREATE TABLE sp_index (
    sp_key          TEXT PRIMARY KEY,
    sp_name         TEXT NOT NULL,
    segment         TEXT,
    tsd_filename    TEXT,
    sharepoint_url  TEXT,
    heading_level   INTEGER,
    called_by       TEXT,
    section_model   TEXT,
    section_flow    TEXT,
    explanation     TEXT,
    confidence      TEXT,
    sql_file        TEXT,
    sql_database    TEXT,
    sql_line        INTEGER,
    body_lines      INTEGER,
    param_count     INTEGER,
    parameters      TEXT,
    status          TEXT NOT NULL,
    ai_summary      TEXT,
    indexed_at      TEXT,
    base_name       TEXT,
    variant         TEXT
);

CREATE TABLE sp_images (
    sp_key      TEXT NOT NULL,
    segment     TEXT,
    kind        TEXT NOT NULL,
    seq         INTEGER,
    path        TEXT NOT NULL,
    width_in    REAL,
    height_in   REAL,
    explanation TEXT
);

CREATE TABLE sp_tables (
    sp_key      TEXT NOT NULL,
    role        TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    operations  TEXT
);

CREATE TABLE spec_tables (
    segment     TEXT NOT NULL,
    category    TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    field_count INTEGER
);

CREATE TABLE spec_fields (
    segment     TEXT NOT NULL,
    category    TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    field       TEXT,
    data_type   TEXT,
    description TEXT
);

CREATE TABLE sp_doc_occurrences (
    sp_key        TEXT NOT NULL,
    sp_name       TEXT NOT NULL,
    segment       TEXT NOT NULL,
    tsd_filename  TEXT NOT NULL,
    heading_level INTEGER,
    called_by     TEXT,
    section_model TEXT,
    section_flow  TEXT,
    confidence    TEXT,
    explanation   TEXT
);

CREATE INDEX idx_occ_key      ON sp_doc_occurrences(sp_key);
CREATE INDEX idx_occ_segment  ON sp_doc_occurrences(segment);
CREATE INDEX idx_sp_segment   ON sp_index(segment);
CREATE INDEX idx_sp_status    ON sp_index(status);
CREATE INDEX idx_sp_base      ON sp_index(base_name);
CREATE INDEX idx_sp_variant   ON sp_index(variant);
CREATE INDEX idx_sp_conf      ON sp_index(confidence);
CREATE INDEX idx_img_key      ON sp_images(sp_key);
CREATE INDEX idx_tbl_key      ON sp_tables(sp_key);
CREATE INDEX idx_tbl_name     ON sp_tables(table_name);
CREATE INDEX idx_spec_segment ON spec_tables(segment);

CREATE VIRTUAL TABLE sp_fts USING fts5(
    sp_key UNINDEXED,
    sp_name,
    segment,
    tsd_filename,
    source_tables,
    target_tables,
    explanation
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_json_dir(d: Path) -> list[dict]:
    if not d.is_dir():
        return []
    out = []
    for f in sorted(d.glob("*.json")):
        try:
            out.append(json.loads(f.read_text(encoding="utf-8")))
        except json.JSONDecodeError as exc:
            print("  ! gagal baca %s: %s" % (f.name, exc))
    return out


def build() -> dict:
    docs = load_json_dir(PARSED_DIR)
    sqls = load_json_dir(SQL_DIR)

    if not docs:
        print("Tidak ada hasil parser docx di %s." % PARSED_DIR)
        print("Jalankan dulu: python app/parsers/docx_parser.py samples")
        sys.exit(1)

    # Peta nama SP dari script SQL. Kunci memakai huruf kecil karena penulisan
    # nama di dokumen dan di script sering berbeda kapitalisasinya.
    sql_map: dict[str, dict] = {}
    base_map: dict[str, list[str]] = {}
    sql_dupes: dict[str, int] = {}
    for s in sqls:
        for p in s["procedures"]:
            k = p["sp_name_lower"]
            if k in sql_map:
                sql_dupes[k] = sql_dupes.get(k, 1) + 1
                continue
            rec = dict(p)
            rec["_file"] = s["file"]
            rec["_db"] = s.get("database")
            sql_map[k] = rec
            base_map.setdefault(
                (p.get("base_name") or p["sp_name"]).lower(), []
            ).append(k)

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)

    ts = now()
    seen_doc_keys: set[str] = set()
    doc_rows: set[str] = set()
    stats = {"matched": 0, "doc_only": 0, "sql_only": 0, "sql_variant": 0,
             "images": 0, "fields": 0, "doc_dupes": 0}

    for d in docs:
        segment = d["segment"]
        fname = d["file"]

        con.execute(
            "INSERT OR REPLACE INTO documents VALUES (?,?,?,?,?,?,?)",
            (fname, segment, None, d.get("procedure_count", 0),
             json.dumps(d.get("change_control", []), ensure_ascii=False),
             json.dumps(d.get("warnings", []), ensure_ascii=False), ts),
        )

        specs = d.get("table_specs") or {}
        for category, block in specs.items():
            for t in (block or {}).get("tables", []):
                con.execute(
                    "INSERT INTO spec_tables VALUES (?,?,?,?)",
                    (segment, category, t["table_name"], t.get("field_count", 0)),
                )
                for fl in t.get("fields", []):
                    con.execute(
                        "INSERT INTO spec_fields VALUES (?,?,?,?,?,?)",
                        (segment, category, t["table_name"], fl.get("field"),
                         fl.get("type"), fl.get("description")),
                    )
                    stats["fields"] += 1

        for p in d["procedures"]:
            key = p["sp_name_lower"]
            seen_doc_keys.add(key)

            dm = p.get("data_model") or {}
            df = p.get("data_flow") or {}
            expl = "\n\n".join(
                x for x in (dm.get("explanation"), df.get("explanation")) if x
            )

            # Satu SP bisa didokumentasikan di lebih dari satu TSD. Semua
            # kemunculan dicatat di tabel ini supaya tidak ada yang hilang,
            # sementara sp_index tetap satu baris per SP agar hasil pencarian
            # tidak memunculkan entri kembar.
            con.execute(
                "INSERT INTO sp_doc_occurrences VALUES (?,?,?,?,?,?,?,?,?,?)",
                (key, p["sp_name"], segment, fname, p.get("heading_level"),
                 p.get("called_by"), dm.get("section"), df.get("section"),
                 p.get("confidence"), expl or None),
            )

            first = key not in doc_rows
            doc_rows.add(key)
            if not first:
                stats["doc_dupes"] += 1

            # Diagram tetap dicatat untuk setiap TSD, karena tiap dokumen
            # memuat gambar yang berbeda meski SP-nya sama.
            for kind, block in (("data_model", dm), ("data_flow", df)):
                for i, im in enumerate(block.get("images", []), start=1):
                    con.execute(
                        "INSERT INTO sp_images VALUES (?,?,?,?,?,?,?,?)",
                        (key, segment, kind, i, im["path"],
                         im.get("width_in"), im.get("height_in"),
                         block.get("explanation") or None),
                    )
                    stats["images"] += 1

            if not first:
                continue

            sq = sql_map.get(key)
            status = "matched" if sq else "doc_only"
            stats[status] += 1

            con.execute(
                "INSERT OR REPLACE INTO sp_index VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    key, p["sp_name"], segment, fname, None,
                    p.get("heading_level"), p.get("called_by"),
                    dm.get("section"), df.get("section"), expl or None,
                    p.get("confidence"),
                    sq["_file"] if sq else None,
                    sq["_db"] if sq else None,
                    sq["line"] if sq else None,
                    sq["body_lines"] if sq else None,
                    sq["param_count"] if sq else None,
                    json.dumps(sq["parameters"], ensure_ascii=False) if sq else None,
                    status, None, ts,
                    sq.get("base_name") if sq else p["sp_name"],
                    sq.get("variant") if sq else None,
                ),
            )

            src_names, tgt_names = [], []
            if sq:
                for t in sq["source_tables"]:
                    con.execute("INSERT INTO sp_tables VALUES (?,?,?,?)",
                                (key, "source", t, None))
                    src_names.append(t)
                for t in sq["target_tables"]:
                    con.execute("INSERT INTO sp_tables VALUES (?,?,?,?)",
                                (key, "target", t["table"],
                                 ",".join(t["operations"])))
                    tgt_names.append(t["table"])

            con.execute(
                "INSERT INTO sp_fts VALUES (?,?,?,?,?,?,?)",
                (key, p["sp_name"], segment, fname,
                 " ".join(src_names), " ".join(tgt_names), expl or ""),
            )

    # SP yang ada di database tapi tidak terdokumentasi di TSD mana pun.
    for key, sq in sql_map.items():
        if key in seen_doc_keys:
            continue
        st = "sql_variant" if sq.get("variant") else "sql_only"
        stats[st] += 1
        con.execute(
            "INSERT OR REPLACE INTO sp_index VALUES "
            "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                key, sq["sp_name"], None, None, None, None, None, None, None,
                None, None, sq["_file"], sq["_db"], sq["line"],
                sq["body_lines"], sq["param_count"],
                json.dumps(sq["parameters"], ensure_ascii=False),
                st, None, ts,
                sq.get("base_name"), sq.get("variant"),
            ),
        )
        for t in sq["source_tables"]:
            con.execute("INSERT INTO sp_tables VALUES (?,?,?,?)",
                        (key, "source", t, None))
        for t in sq["target_tables"]:
            con.execute("INSERT INTO sp_tables VALUES (?,?,?,?)",
                        (key, "target", t["table"], ",".join(t["operations"])))
        con.execute(
            "INSERT INTO sp_fts VALUES (?,?,?,?,?,?,?)",
            (key, sq["sp_name"], "", "",
             " ".join(sq["source_tables"]),
             " ".join(t["table"] for t in sq["target_tables"]), ""),
        )

    con.commit()
    stats["sql_dupes"] = len(sql_dupes)
    stats["sql_total"] = len(sql_map)
    report(con, stats)
    con.close()
    return stats


def report(con: sqlite3.Connection, stats: dict) -> None:
    bar = "=" * 78
    print("")
    print(bar)
    print("INDEKS SELESAI DIBANGUN -> %s" % DB_PATH)
    print(bar)

    total = con.execute("SELECT COUNT(*) FROM sp_index").fetchone()[0]
    print("Total baris sp_index      : %d" % total)
    print("  matched  (TSD + SQL)    : %d" % stats["matched"])
    print("  doc_only (TSD saja)     : %d" % stats["doc_only"])
    print("  sql_only (SQL saja)     : %d" % stats["sql_only"])
    print("  sql_variant (salinan)   : %d" % stats["sql_variant"])
    print("Diagram terindeks         : %d" % stats["images"])
    print("Field spec terindeks      : %d" % stats["fields"])
    if stats["sql_dupes"]:
        print("Nama SP ganda di SQL      : %d" % stats["sql_dupes"])
    if stats.get("doc_dupes"):
        print("SP di lebih dari satu TSD : %d" % stats["doc_dupes"])

    rows = con.execute(
        "SELECT o.segment, COUNT(*), "
        "SUM(i.status='matched'), SUM(o.confidence='low') "
        "FROM sp_doc_occurrences o "
        "JOIN sp_index i ON i.sp_key = o.sp_key "
        "GROUP BY o.segment ORDER BY 2 DESC"
    ).fetchall()
    if rows:
        print("\n--- PER SEGMENT ---")
        print("  %-34s %5s %8s %6s" % ("segment", "sp", "matched", "low"))
        for seg, n, m, low in rows:
            print("  %-34s %5d %8d %6d" % (seg[:34], n, m or 0, low or 0))

    dups = con.execute(
        "SELECT sp_name, COUNT(*) c, GROUP_CONCAT(segment, ' | ') segs "
        "FROM sp_doc_occurrences GROUP BY sp_key HAVING c > 1 "
        "ORDER BY c DESC, sp_name"
    ).fetchall()
    if dups:
        print("\n--- SP TERDOKUMENTASI DI LEBIH DARI SATU TSD ---")
        for nm, c, segs in dups:
            print("  %-44s %d dokumen" % (nm[:44], c))
            print("      %s" % segs)

    if stats["doc_only"]:
        print("\n--- TERDOKUMENTASI TAPI TIDAK DITEMUKAN DI SCRIPT SQL ---")
        for (nm, seg) in con.execute(
            "SELECT sp_name, segment FROM sp_index "
            "WHERE status='doc_only' ORDER BY sp_name LIMIT 15"
        ):
            print("  %-46s %s" % (nm[:46], seg))
        if stats["doc_only"] > 15:
            print("  ... dan %d lainnya" % (stats["doc_only"] - 15))

    if stats["sql_only"]:
        print("\n--- ADA DI DATABASE TAPI TIDAK ADA DI TSD ---")
        for (nm, db, bl) in con.execute(
            "SELECT sp_name, sql_database, body_lines FROM sp_index "
            "WHERE status='sql_only' ORDER BY body_lines DESC LIMIT 15"
        ):
            print("  %-46s %-14s %d baris" % (nm[:46], db or "-", bl or 0))
        if stats["sql_only"] > 15:
            print("  ... dan %d lainnya" % (stats["sql_only"] - 15))

    berarsip = con.execute(
        "SELECT v.base_name, COUNT(*) c, "
        "MAX(EXISTS(SELECT 1 FROM sp_index d "
        "           WHERE LOWER(d.sp_name)=LOWER(v.base_name) "
        "             AND d.status IN ('matched','doc_only'))) terdok "
        "FROM sp_index v WHERE v.status='sql_variant' "
        "GROUP BY LOWER(v.base_name) ORDER BY c DESC LIMIT 10"
    ).fetchall()
    if berarsip:
        print("\n--- SP DENGAN SALINAN ARSIP TERBANYAK ---")
        print("  %-44s %8s  %s" % ("nama dasar", "salinan", "di TSD?"))
        for b, c, t in berarsip:
            print("  %-44s %8d  %s" % (b[:44], c, "ya" if t else "tidak"))

    hot = con.execute(
        "SELECT table_name, COUNT(DISTINCT sp_key) c FROM sp_tables "
        "GROUP BY LOWER(table_name) ORDER BY c DESC LIMIT 10"
    ).fetchall()
    if hot:
        print("\n--- TABEL PALING BANYAK DIPAKAI ---")
        for t, c in hot:
            print("  %-46s %d SP" % (t[:46], c))
    print("")


def search(term: str, limit: int = 15) -> None:
    if not DB_PATH.exists():
        print("Indeks belum ada. Jalankan dulu tanpa --cari.")
        sys.exit(1)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    rows = con.execute(
        "SELECT f.sp_key, i.sp_name, i.segment, i.tsd_filename, i.status, "
        "i.confidence, i.variant, i.base_name, i.sql_database, "
        "bm25(sp_fts) AS skor "
        "FROM sp_fts f JOIN sp_index i ON i.sp_key = f.sp_key "
        "WHERE sp_fts MATCH ? "
        "ORDER BY (LOWER(i.sp_name) = LOWER(?)) DESC, "
        "         (i.status = 'matched') DESC, "
        "         (i.variant IS NULL) DESC, "
        "         (i.status = 'sql_variant') ASC, "
        "         skor "
        "LIMIT ?",
        (term, term, limit),
    ).fetchall()

    print("\nHasil pencarian '%s' : %d\n" % (term, len(rows)))
    for r in rows:
        tanda = "  <- salinan arsip dari %s" % r["base_name"] \
            if r["variant"] else ""
        print("  %-44s [%s/%s]%s" % (r["sp_name"][:44], r["status"],
                                     r["confidence"] or "-", tanda))
        print("      segment : %s" % (r["segment"] or "-"))
        print("      TSD     : %s" % (r["tsd_filename"] or "-"))
        if r["sql_database"]:
            print("      SQL     : %s" % r["sql_database"])
        imgs = con.execute(
            "SELECT kind, path FROM sp_images WHERE sp_key=? ORDER BY kind, seq",
            (r["sp_key"],),
        ).fetchall()
        for im in imgs:
            print("      %-10s %s" % (im["kind"], im["path"]))
    print("")
    con.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Bangun indeks TSD ke SQLite.")
    ap.add_argument("--cari", metavar="KATA",
                    help="cari di indeks yang sudah ada, tanpa membangun ulang")
    args = ap.parse_args()

    if args.cari:
        search(args.cari)
    else:
        build()


if __name__ == "__main__":
    main()
