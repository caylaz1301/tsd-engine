"""Akses baca-saja ke indeks SQLite hasil build_index.py.

Semua kueri dikumpulkan di sini supaya lapisan API tidak menulis SQL sendiri.
Koneksi dibuka per permintaan dengan mode read-only agar server tidak pernah
mengubah indeks, dan agar membangun ulang indeks tidak perlu mematikan server.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any, Iterable

BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / "storage" / "tsd_index.db"
IMAGES_DIR = BASE_DIR / "storage" / "images"

TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")


class IndexMissingError(RuntimeError):
    """Indeks belum dibangun."""


def connect() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise IndexMissingError(
            "Indeks belum ada di %s. Jalankan: "
            "python app/indexer/build_index.py" % DB_PATH
        )
    con = sqlite3.connect("file:%s?mode=ro" % DB_PATH, uri=True)
    con.row_factory = sqlite3.Row
    return con


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


def build_match_expression(q: str) -> str | None:
    """Ubah input bebas menjadi ekspresi FTS5 yang aman.

    Input pengguna tidak boleh masuk langsung ke MATCH: tanda seperti tanda
    kutip, tanda minus, atau tanda bintang punya makna khusus di FTS5 dan bisa
    memicu galat sintaks. Jadi kita ambil hanya token alfanumerik, kutip satu
    per satu, lalu tambahkan awalan cocok sebagian.

    Nama SP dipecah oleh tokenizer bawaan pada setiap garis bawah, sehingga
    mencari "sp_update_collateral" menjadi gabungan empat token ber-AND.
    """
    tokens = TOKEN_RE.findall(q or "")
    if not tokens:
        return None
    return " ".join('"%s"*' % t for t in tokens)


SEARCH_SQL = """
SELECT i.sp_key, i.sp_name, i.segment, i.tsd_filename, i.status,
       i.confidence, i.variant, i.base_name, i.sql_database, i.sql_file,
       i.body_lines, i.param_count, i.called_by,
       (SELECT COUNT(*) FROM sp_images m WHERE m.sp_key = i.sp_key) AS image_count,
       bm25(sp_fts) AS score
FROM sp_fts f
JOIN sp_index i ON i.sp_key = f.sp_key
WHERE sp_fts MATCH :match
  AND (:status   IS NULL OR i.status  = :status)
  AND (:segment  IS NULL OR i.segment = :segment)
  AND (:hide_variants = 0 OR i.variant IS NULL)
ORDER BY (LOWER(i.sp_name) = LOWER(:raw)) DESC,
         (i.status = 'matched') DESC,
         (i.variant IS NULL) DESC,
         (i.status = 'sql_variant') ASC,
         score
LIMIT :limit OFFSET :offset
"""

COUNT_SQL = """
SELECT COUNT(*) FROM sp_fts f
JOIN sp_index i ON i.sp_key = f.sp_key
WHERE sp_fts MATCH :match
  AND (:status  IS NULL OR i.status  = :status)
  AND (:segment IS NULL OR i.segment = :segment)
  AND (:hide_variants = 0 OR i.variant IS NULL)
"""


def search(
    q: str,
    status: str | None = None,
    segment: str | None = None,
    hide_variants: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    match = build_match_expression(q)
    if match is None:
        return {"total": 0, "results": [], "query": q}

    params = {
        "match": match,
        "raw": q.strip(),
        "status": status,
        "segment": segment,
        "hide_variants": 1 if hide_variants else 0,
        "limit": limit,
        "offset": offset,
    }
    con = connect()
    try:
        total = con.execute(COUNT_SQL, params).fetchone()[0]
        rows = rows_to_dicts(con.execute(SEARCH_SQL, params).fetchall())
    finally:
        con.close()
    return {"total": total, "results": rows, "query": q}


def get_sp(name: str) -> dict[str, Any] | None:
    """Detail satu SP beserta diagram, tabel, pemanggil, dan salinan arsipnya."""
    con = connect()
    try:
        row = con.execute(
            "SELECT * FROM sp_index WHERE sp_key = LOWER(?)", (name,)
        ).fetchone()
        if row is None:
            return None
        sp = dict(row)
        key = sp["sp_key"]

        sp["images"] = rows_to_dicts(con.execute(
            "SELECT segment, kind, seq, path, width_in, height_in, explanation "
            "FROM sp_images "
            "WHERE sp_key = ? ORDER BY kind, seq", (key,)
        ).fetchall())

        tables = rows_to_dicts(con.execute(
            "SELECT role, table_name, operations FROM sp_tables "
            "WHERE sp_key = ? ORDER BY role, table_name", (key,)
        ).fetchall())
        sp["source_tables"] = [t for t in tables if t["role"] == "source"]
        sp["target_tables"] = [t for t in tables if t["role"] == "target"]

        # Semua TSD yang mendokumentasikan SP ini. Biasanya satu, tapi
        # sebagian SP dibahas di lebih dari satu dokumen.
        sp["occurrences"] = rows_to_dicts(con.execute(
            "SELECT segment, tsd_filename, heading_level, section_model, "
            "section_flow, confidence FROM sp_doc_occurrences "
            "WHERE sp_key = ? ORDER BY segment", (key,)
        ).fetchall())

        # SP lain yang menurut dokumen dipanggil OLEH SP ini.
        sp["calls_documented"] = rows_to_dicts(con.execute(
            "SELECT sp_name, segment FROM sp_index "
            "WHERE LOWER(called_by) = LOWER(?) ORDER BY sp_name",
            (sp["sp_name"],)
        ).fetchall())

        sp["archive_copies"] = rows_to_dicts(con.execute(
            "SELECT sp_name, variant, sql_database, body_lines FROM sp_index "
            "WHERE status = 'sql_variant' AND LOWER(base_name) = LOWER(?) "
            "ORDER BY sp_name", (sp["base_name"] or sp["sp_name"],)
        ).fetchall())

        if sp.get("tsd_filename"):
            doc = con.execute(
                "SELECT tsd_filename, segment, sharepoint_url, "
                "procedure_count FROM documents WHERE tsd_filename = ?",
                (sp["tsd_filename"],)
            ).fetchone()
            sp["document"] = dict(doc) if doc else None
        else:
            sp["document"] = None
        return sp
    finally:
        con.close()


def stats() -> dict[str, Any]:
    con = connect()
    try:
        by_status = {
            r["status"]: r["c"] for r in con.execute(
                "SELECT status, COUNT(*) c FROM sp_index GROUP BY status"
            )
        }
        # Dihitung dari sp_doc_occurrences supaya SP yang muncul di dua
        # TSD tetap terhitung di kedua segment.
        segments = rows_to_dicts(con.execute(
            "SELECT o.segment, COUNT(*) total, "
            "SUM(i.status = 'matched') matched, "
            "SUM(o.confidence = 'low') low_confidence "
            "FROM sp_doc_occurrences o "
            "JOIN sp_index i ON i.sp_key = o.sp_key "
            "GROUP BY o.segment ORDER BY total DESC"
        ).fetchall())
        totals = con.execute(
            "SELECT COUNT(*) sp_total, "
            "(SELECT COUNT(*) FROM sp_images) images, "
            "(SELECT COUNT(*) FROM spec_fields) spec_fields, "
            "(SELECT COUNT(*) FROM documents) documents "
            "FROM sp_index"
        ).fetchone()
        hot_tables = rows_to_dicts(con.execute(
            "SELECT table_name, COUNT(DISTINCT sp_key) sp_count FROM sp_tables "
            "GROUP BY LOWER(table_name) ORDER BY sp_count DESC LIMIT 15"
        ).fetchall())
        most_copied = rows_to_dicts(con.execute(
            "SELECT base_name, COUNT(*) copies FROM sp_index "
            "WHERE status = 'sql_variant' "
            "GROUP BY LOWER(base_name) ORDER BY copies DESC LIMIT 15"
        ).fetchall())
        return {
            "by_status": by_status,
            "totals": dict(totals),
            "segments": segments,
            "hot_tables": hot_tables,
            "most_copied": most_copied,
        }
    finally:
        con.close()


def list_segments() -> list[dict[str, Any]]:
    con = connect()
    try:
        return rows_to_dicts(con.execute(
            "SELECT d.tsd_filename, d.segment, d.procedure_count, "
            "d.sharepoint_url, "
            "(SELECT COUNT(*) FROM sp_index i "
            "  WHERE i.tsd_filename = d.tsd_filename "
            "    AND i.status = 'matched') indexed_sp "
            "FROM documents d ORDER BY d.segment"
        ).fetchall())
    finally:
        con.close()


def review_items(limit: int = 12) -> dict[str, Any]:
    """Kumpulan item yang paling layak ditinjau dari indeks saat ini."""
    con = connect()
    try:
        sql_only_total = con.execute(
            "SELECT COUNT(*) FROM sp_index "
            "WHERE status = 'sql_only' AND variant IS NULL"
        ).fetchone()[0]
        doc_only_total = con.execute(
            "SELECT COUNT(*) FROM sp_index WHERE status = 'doc_only'"
        ).fetchone()[0]
        low_confidence_total = con.execute(
            "SELECT COUNT(DISTINCT sp_key) FROM sp_doc_occurrences "
            "WHERE confidence = 'low'"
        ).fetchone()[0]
        multi_doc_total = con.execute(
            "SELECT COUNT(*) FROM ("
            "  SELECT sp_key FROM sp_doc_occurrences "
            "  GROUP BY sp_key HAVING COUNT(DISTINCT tsd_filename) > 1"
            ")"
        ).fetchone()[0]

        sql_only = rows_to_dicts(con.execute(
            "SELECT sp_key, sp_name, segment, tsd_filename, status, confidence, "
            "variant, base_name, sql_database, sql_file, body_lines, param_count, "
            "called_by, 0 AS image_count "
            "FROM sp_index "
            "WHERE status = 'sql_only' AND variant IS NULL "
            "ORDER BY body_lines DESC, sp_name LIMIT ?",
            (limit,),
        ).fetchall())
        doc_only = rows_to_dicts(con.execute(
            "SELECT sp_key, sp_name, segment, tsd_filename, status, confidence, "
            "variant, base_name, sql_database, sql_file, body_lines, param_count, "
            "called_by, "
            "(SELECT COUNT(*) FROM sp_images m WHERE m.sp_key = i.sp_key) image_count "
            "FROM sp_index i "
            "WHERE status = 'doc_only' "
            "ORDER BY segment, sp_name LIMIT ?",
            (limit,),
        ).fetchall())
        low_confidence = rows_to_dicts(con.execute(
            "SELECT i.sp_key, i.sp_name, i.segment, i.tsd_filename, i.status, "
            "i.confidence, i.variant, i.base_name, i.sql_database, i.sql_file, "
            "i.body_lines, i.param_count, i.called_by, "
            "(SELECT COUNT(*) FROM sp_images m WHERE m.sp_key = i.sp_key) image_count, "
            "GROUP_CONCAT(DISTINCT o.segment) AS segments "
            "FROM sp_doc_occurrences o "
            "JOIN sp_index i ON i.sp_key = o.sp_key "
            "WHERE o.confidence = 'low' "
            "GROUP BY i.sp_key "
            "ORDER BY i.segment, i.sp_name LIMIT ?",
            (limit,),
        ).fetchall())
        multi_doc = rows_to_dicts(con.execute(
            "SELECT i.sp_key, i.sp_name, i.segment, i.tsd_filename, i.status, "
            "i.confidence, i.variant, i.base_name, i.sql_database, i.sql_file, "
            "i.body_lines, i.param_count, i.called_by, "
            "(SELECT COUNT(*) FROM sp_images m WHERE m.sp_key = i.sp_key) image_count, "
            "COUNT(DISTINCT o.tsd_filename) AS document_count, "
            "GROUP_CONCAT(DISTINCT o.segment) AS segments "
            "FROM sp_doc_occurrences o "
            "JOIN sp_index i ON i.sp_key = o.sp_key "
            "GROUP BY i.sp_key "
            "HAVING COUNT(DISTINCT o.tsd_filename) > 1 "
            "ORDER BY document_count DESC, i.sp_name LIMIT ?",
            (limit,),
        ).fetchall())

        return {
            "totals": {
                "sql_only": sql_only_total,
                "doc_only": doc_only_total,
                "low_confidence": low_confidence_total,
                "multi_doc": multi_doc_total,
            },
            "sql_only": sql_only,
            "doc_only": doc_only,
            "low_confidence": low_confidence,
            "multi_doc": multi_doc,
        }
    finally:
        con.close()


def spec_tables(segment: str) -> list[dict[str, Any]]:
    con = connect()
    try:
        tables = rows_to_dicts(con.execute(
            "SELECT category, table_name, field_count FROM spec_tables "
            "WHERE segment = ? ORDER BY category, table_name", (segment,)
        ).fetchall())
        for t in tables:
            t["fields"] = rows_to_dicts(con.execute(
                "SELECT field, data_type, description FROM spec_fields "
                "WHERE segment = ? AND category = ? AND table_name = ?",
                (segment, t["category"], t["table_name"])
            ).fetchall())
        return tables
    finally:
        con.close()


def table_lineage(table_name: str) -> dict[str, Any]:
    """SP mana yang membaca dan menulis sebuah tabel."""
    con = connect()
    try:
        rows = rows_to_dicts(con.execute(
            "SELECT t.role, t.operations, i.sp_name, i.segment, i.status "
            "FROM sp_tables t JOIN sp_index i ON i.sp_key = t.sp_key "
            "WHERE LOWER(t.table_name) LIKE '%' || LOWER(?) || '%' "
            "  AND i.variant IS NULL "
            "ORDER BY t.role, i.sp_name LIMIT 200", (table_name,)
        ).fetchall())
        return {
            "table": table_name,
            "readers": [r for r in rows if r["role"] == "source"],
            "writers": [r for r in rows if r["role"] == "target"],
        }
    finally:
        con.close()
