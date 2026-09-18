"""Validasi, simpan, dan indeks ulang satu dokumen TSD lokal."""

from __future__ import annotations

import json
import os
import shutil
import re
import threading
import uuid
import zipfile
from pathlib import Path

from app.indexer import build_index
from app.parsers import docx_parser

SAMPLES_DIR = Path("samples")
PARSED_DIR = Path("storage/parsed")
IMAGES_DIR = Path("storage/images")
MAX_FILE_BYTES = 30 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_ZIP_ENTRIES = 10_000
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.docx$", re.IGNORECASE)

_index_lock = threading.Lock()


class UploadValidationError(ValueError):
    pass


class DuplicateDocumentError(FileExistsError):
    pass


def validate_filename(filename: str) -> str:
    name = Path(filename).name
    if name != filename or not SAFE_NAME_RE.fullmatch(name):
        raise UploadValidationError(
            "Nama file tidak valid. Gunakan huruf, angka, spasi, titik, strip, "
            "atau garis bawah, dengan ekstensi .docx."
        )
    if name.startswith("~$"):
        raise UploadValidationError("File sementara Microsoft Word tidak dapat diunggah.")
    return name


def validate_docx(path: Path) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if len(entries) > MAX_ZIP_ENTRIES:
                raise UploadValidationError("Dokumen berisi terlalu banyak bagian internal.")
            if sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_BYTES:
                raise UploadValidationError("Ukuran isi dokumen setelah dibuka terlalu besar.")
            required = {"[Content_Types].xml", "word/document.xml"}
            if not required.issubset(names):
                raise UploadValidationError(
                    "File bukan dokumen Word DOCX yang valid atau isinya rusak."
                )
    except zipfile.BadZipFile as exc:
        raise UploadValidationError(
            "File bukan dokumen Word DOCX yang valid atau isinya rusak."
        ) from exc


def ingest_document(temp_path: Path, filename: str, replace: bool = False) -> dict:
    """Pindahkan unggahan tervalidasi, parse, lalu bangun ulang indeks."""
    name = validate_filename(filename)
    if temp_path.stat().st_size == 0:
        raise UploadValidationError("File kosong.")
    if temp_path.stat().st_size > MAX_FILE_BYTES:
        raise UploadValidationError("Ukuran file melebihi batas 30 MB.")
    validate_docx(temp_path)

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    destination = SAMPLES_DIR / name
    if destination.exists() and not replace:
        raise DuplicateDocumentError(
            "Dokumen dengan nama yang sama sudah ada. Aktifkan pilihan ganti file untuk memperbaruinya."
        )

    backup = None
    parsed_backup = None
    parsed_path = PARSED_DIR / f"{destination.stem}.json"
    with _index_lock:
        try:
            if destination.exists():
                backup = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.bak")
                destination.replace(backup)
            if parsed_path.exists():
                parsed_backup = parsed_path.with_name(
                    f".{parsed_path.name}.{uuid.uuid4().hex}.bak"
                )
                parsed_path.replace(parsed_backup)
            # Staging dan samples berada pada volume Docker yang berbeda.
            shutil.move(str(temp_path), destination)

            parsed = docx_parser.parse(destination, IMAGES_DIR)
            parsed_path.write_text(
                json.dumps(parsed, indent=2, ensure_ascii=False), encoding="utf-8"
            )
            stats = build_index.build()
        except Exception:
            destination.unlink(missing_ok=True)
            parsed_path.unlink(missing_ok=True)
            if backup is not None and backup.exists():
                backup.replace(destination)
            if parsed_backup is not None and parsed_backup.exists():
                parsed_backup.replace(parsed_path)
            raise
        finally:
            temp_path.unlink(missing_ok=True)

        if backup is not None:
            backup.unlink(missing_ok=True)
        if parsed_backup is not None:
            parsed_backup.unlink(missing_ok=True)

    return {
        "filename": name,
        "segment": parsed["segment"],
        "procedure_count": parsed["procedure_count"],
        "warning_count": len(parsed.get("warnings", [])),
        "totals": stats,
    }
