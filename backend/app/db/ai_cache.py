"""Cache analisis AI yang tidak ikut terhapus saat indeks TSD dibangun ulang."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


DB_PATH = Path(__file__).resolve().parents[2] / "storage" / "ai_cache.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS sp_analysis (
            sp_key TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            model TEXT NOT NULL,
            analysis_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (sp_key, source_hash, model)
        )
        """
    )
    return con


def get(sp_name: str, digest: str, model: str) -> dict[str, Any] | None:
    with _connect() as con:
        row = con.execute(
            "SELECT analysis_json, created_at FROM sp_analysis "
            "WHERE sp_key = LOWER(?) AND source_hash = ? AND model = ?",
            (sp_name, digest, model),
        ).fetchone()
    if row is None:
        return None
    return {"analysis": json.loads(row["analysis_json"]), "created_at": row["created_at"]}


def put(sp_name: str, digest: str, model: str, analysis: dict[str, Any]) -> str:
    with _connect() as con:
        con.execute(
            "INSERT OR REPLACE INTO sp_analysis "
            "(sp_key, source_hash, model, analysis_json, created_at) "
            "VALUES (LOWER(?), ?, ?, ?, CURRENT_TIMESTAMP)",
            (sp_name, digest, model, json.dumps(analysis, ensure_ascii=False)),
        )
        row = con.execute(
            "SELECT created_at FROM sp_analysis WHERE sp_key = LOWER(?) "
            "AND source_hash = ? AND model = ?",
            (sp_name, digest, model),
        ).fetchone()
    return row["created_at"]
