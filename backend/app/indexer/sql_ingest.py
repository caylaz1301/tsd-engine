"""Validasi dan aktivasi sumber SQL yang diunggah melalui web."""

from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from pathlib import Path

from app.indexer import build_index
from app.parsers.sql_parser import parse_file
from app.source_paths import paths_for


MAX_SQL_BYTES = 100 * 1024 * 1024
SAFE_SQL_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.sql$", re.I)
_lock = threading.Lock()


class SqlUploadError(ValueError):
    pass


class DuplicateSqlError(FileExistsError):
    pass


def validate_sql_filename(filename: str) -> str:
    name = Path(filename).name
    if name != filename or not SAFE_SQL_NAME_RE.fullmatch(name):
        raise SqlUploadError(
            "Nama skrip tidak valid. Gunakan huruf, angka, spasi, titik, strip, "
            "atau garis bawah dengan ekstensi .sql."
        )
    return name


def ingest_sql(temp_path: Path, filename: str, bank: str, replace: bool = False) -> dict:
    name = validate_sql_filename(filename)
    size = temp_path.stat().st_size
    if size == 0:
        raise SqlUploadError("File SQL kosong.")
    if size > MAX_SQL_BYTES:
        raise SqlUploadError("Ukuran skrip SQL melebihi batas 100 MB.")

    paths = paths_for(bank).ensure()
    destination = paths.sql / name
    parsed_path = paths.parsed_sql / f"{Path(name).stem}.json"
    if destination.exists() and not replace:
        raise DuplicateSqlError(
            "Skrip dengan nama yang sama sudah ada pada bank ini. Aktifkan pilihan ganti file untuk memperbaruinya."
        )

    with _lock:
        backup = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.bak")
        parsed_backup = parsed_path.with_name(f".{parsed_path.name}.{uuid.uuid4().hex}.bak")
        try:
            if destination.exists():
                destination.replace(backup)
            if parsed_path.exists():
                parsed_path.replace(parsed_backup)
            shutil.move(str(temp_path), destination)
            parsed = parse_file(destination)
            if not parsed.get("procedures"):
                raise SqlUploadError(
                    "Tidak ada CREATE PROCEDURE atau ALTER PROCEDURE yang dapat dibaca dari skrip ini."
                )
            parsed_path.write_text(
                json.dumps(parsed, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            totals = build_index.build()
        except BaseException:
            destination.unlink(missing_ok=True)
            parsed_path.unlink(missing_ok=True)
            if backup.exists():
                backup.replace(destination)
            if parsed_backup.exists():
                parsed_backup.replace(parsed_path)
            raise
        finally:
            temp_path.unlink(missing_ok=True)
        backup.unlink(missing_ok=True)
        parsed_backup.unlink(missing_ok=True)

    return {
        "filename": name,
        "bank": paths.bank,
        "encoding": parsed.get("encoding"),
        "database": parsed.get("database"),
        "procedure_count": parsed.get("procedure_count", 0),
        "primary_procedure_count": sum(
            1 for procedure in parsed.get("procedures", []) if not procedure.get("variant")
        ),
        "archive_copy_count": sum(
            1 for procedure in parsed.get("procedures", []) if procedure.get("variant")
        ),
        "totals": totals,
    }


def list_sql_sources(bank: str) -> list[dict]:
    paths = paths_for(bank).ensure()
    rows = []
    for path in sorted(paths.sql.glob("*.sql"), key=lambda item: item.stat().st_mtime, reverse=True):
        parsed_path = paths.parsed_sql / f"{path.stem}.json"
        parsed = {}
        try:
            parsed = json.loads(parsed_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
        rows.append({
            "filename": path.name,
            "bank": paths.bank,
            "size_bytes": path.stat().st_size,
            "modified_at": path.stat().st_mtime,
            "database": parsed.get("database"),
            "encoding": parsed.get("encoding"),
            "procedure_count": parsed.get("procedure_count", 0),
            "status": "active" if parsed else "error",
        })
    return rows


def delete_sql_source(filename: str, bank: str) -> dict:
    name = validate_sql_filename(filename)
    paths = paths_for(bank).ensure()
    source = paths.sql / name
    parsed = paths.parsed_sql / f"{Path(name).stem}.json"
    if not source.exists():
        raise FileNotFoundError("Skrip SQL tidak ditemukan pada bank ini.")
    with _lock:
        source_hold = source.with_name(f".{source.name}.deleting")
        parsed_hold = parsed.with_name(f".{parsed.name}.deleting")
        source.replace(source_hold)
        if parsed.exists():
            parsed.replace(parsed_hold)
        try:
            build_index.build()
        except BaseException:
            source_hold.replace(source)
            if parsed_hold.exists():
                parsed_hold.replace(parsed)
            raise
        source_hold.unlink(missing_ok=True)
        parsed_hold.unlink(missing_ok=True)
    return {"filename": name, "bank": paths.bank, "status": "deleted"}
