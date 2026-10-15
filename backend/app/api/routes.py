"""Endpoint HTTP untuk mesin pencari TSD.

Lapisan ini sengaja tipis: seluruh SQL ada di app/db/index_db.py, sehingga
rute di sini hanya memvalidasi input, memanggil satu fungsi, dan membentuk
balasan JSON.
"""

from __future__ import annotations

from typing import Literal

from pathlib import Path
import tempfile
import requests

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.db import index_db
from app.ai import ollama_client
from app.db import ai_cache
from app.indexer.ingest import (
    DuplicateDocumentError,
    MAX_FILE_BYTES,
    UploadValidationError,
    ingest_document,
    validate_filename,
)
from app.indexer.sql_ingest import (
    DuplicateSqlError,
    MAX_SQL_BYTES,
    SqlUploadError,
    delete_sql_source,
    ingest_sql,
    list_sql_sources,
    validate_sql_filename,
)
from app.quality import checker
from app.documents import repository
from app.documents import editor
from app import exports
from app.banks import UNKNOWN_BANK, normalize_bank

router = APIRouter(prefix="/api")

STATUS_VALUES = ("matched", "doc_only", "sql_only", "sql_variant")


class DocumentMetadata(BaseModel):
    filename: str = Field(min_length=6, max_length=185)
    module: str = Field(min_length=1, max_length=40)
    bank: str = Field(min_length=1, max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=10)


def _guard(fn, *args, **kwargs):
    """Ubah indeks yang belum dibangun menjadi galat HTTP yang jelas."""
    try:
        return fn(*args, **kwargs)
    except index_db.IndexMissingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _bank(value: str) -> str:
    try:
        return normalize_bank(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict:
    ready = index_db.DB_PATH.exists()
    return {
        "status": "ok" if ready else "index_missing",
        "index_path": str(index_db.DB_PATH),
        "index_ready": ready,
    }


@router.get("/stats")
def get_stats(bank: str | None = Query(None)) -> dict:
    bank = _bank(bank) if bank else None
    result = _guard(index_db.stats, bank=bank)
    reports = checker.list_reports()
    if bank:
        reports = [
            report for report in reports
            if (report.get("bank") or report.get("bank_suggestion") or UNKNOWN_BANK) == bank
        ]
    passed = sum(report.get("score") == 100 for report in reports)
    result["quality"] = {
        "reports": len(reports),
        "passed": passed,
        "pass_rate": round(passed / len(reports) * 100, 1) if reports else 0,
    }
    return result


@router.get("/exports/matrix.xlsx")
def export_matrix() -> FileResponse:
    path = exports.matrix_workbook()
    return FileResponse(
        path,
        filename="Matriks_Cakupan_TSD.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/search")
def get_search(
    q: str = Query("", description="kata kunci atau nama SP"),
    status: str | None = Query(None),
    segment: str | None = Query(None),
    module: str | None = Query(None),
    bank: str | None = Query(None),
    hide_variants: bool = Query(False, description="sembunyikan salinan arsip"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    bank = _bank(bank) if bank else None
    if status is not None and status not in STATUS_VALUES:
        raise HTTPException(
            status_code=422,
            detail="status harus salah satu dari %s" % (STATUS_VALUES,),
        )
    return _guard(
        index_db.search,
        q=q,
        status=status,
        segment=segment,
        module=module,
        bank=bank,
        hide_variants=hide_variants,
        limit=limit,
        offset=offset,
    )


@router.get("/sp/{sp_name}")
def get_sp(sp_name: str, bank: str = Query("SCB")) -> dict:
    sp = _guard(index_db.get_sp, sp_name, _bank(bank))
    if sp is None:
        raise HTTPException(
            status_code=404,
            detail="Stored procedure '%s' tidak ada di indeks." % sp_name,
        )
    return sp


@router.get("/ai/status")
def get_ai_status() -> dict:
    return ollama_client.status()


@router.post("/sp/{sp_name}/analysis")
def analyze_sp(sp_name: str, refresh: bool = Query(False), bank: str = Query("SCB")) -> dict:
    bank = _bank(bank)
    sp = _guard(index_db.get_sp, sp_name, bank)
    if sp is None:
        raise HTTPException(status_code=404, detail="Stored procedure tidak ada di indeks.")

    context = ollama_client.build_context(sp)
    digest = ollama_client.source_hash(context)
    if not refresh:
        cached = ai_cache.get(f"{bank}::{sp_name}", digest, ollama_client.OLLAMA_MODEL)
        if cached:
            return {**cached, "model": ollama_client.OLLAMA_MODEL, "cached": True}

    try:
        analysis = ollama_client.analyze(context).model_dump()
    except ollama_client.OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    created_at = ai_cache.put(f"{bank}::{sp_name}", digest, ollama_client.OLLAMA_MODEL, analysis)
    return {
        "analysis": analysis,
        "model": ollama_client.OLLAMA_MODEL,
        "created_at": created_at,
        "cached": False,
    }


@router.get("/sp/{sp_name}/report.pdf")
def export_sp_report(sp_name: str, bank: str = Query("SCB")) -> FileResponse:
    bank = _bank(bank)
    sp = _guard(index_db.get_sp, sp_name, bank)
    if sp is None:
        raise HTTPException(status_code=404, detail="Stored procedure tidak ada di indeks.")
    context = ollama_client.build_context(sp)
    digest = ollama_client.source_hash(context)
    cached = ai_cache.get(f"{bank}::{sp_name}", digest, ollama_client.OLLAMA_MODEL)
    try:
        analysis = cached["analysis"] if cached else ollama_client.analyze(context).model_dump()
        path = exports.sp_report_pdf(sp, analysis)
    except (ollama_client.OllamaUnavailableError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return FileResponse(
        path,
        filename=f"Analisis_{sp['sp_name']}.pdf",
        media_type="application/pdf",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/segments")
def get_segments(bank: str | None = Query(None)) -> dict:
    bank = _bank(bank) if bank else None
    active = _guard(index_db.list_segments, bank)
    repository.sync_registry(active)
    inactive = repository.inactive_documents(bank) if bank else sum(
        (repository.inactive_documents(item) for item in repository.list_banks()), []
    )
    documents = [*repository.enrich_documents(active), *inactive]
    return {"segments": documents}


@router.get("/modules")
def get_modules(bank: str | None = Query(None)) -> dict:
    return {"modules": _guard(index_db.list_modules, _bank(bank) if bank else None)}


@router.get("/banks")
def get_banks() -> dict:
    return {"banks": repository.list_banks()}


@router.get("/documents/checks")
def get_document_checks(bank: str | None = Query(None)) -> dict:
    bank = _bank(bank) if bank else None
    reports = checker.list_reports(limit=None if bank else 10)
    if bank:
        reports = [
            report for report in reports
            if (report.get("bank") or report.get("bank_suggestion") or UNKNOWN_BANK) == bank
        ][:10]
    return {"reports": reports}


@router.post("/documents/upload", status_code=201)
async def upload_document_source(
    request: Request,
    bank: str = Query(...),
    replace: bool = Query(False),
) -> dict:
    """Simpan TSD admin langsung sebagai sumber aktif tanpa quality checker."""
    try:
        bank = normalize_bank(bank)
        filename = validate_filename(request.headers.get("x-file-name", ""))
    except (ValueError, UploadValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    temp_path: Path | None = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(prefix="tsd-upload-", suffix=".docx", delete=False) as temp:
            temp_path = Path(temp.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="Ukuran file melebihi batas 30 MB.")
                temp.write(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail="File kosong.")
        result = await run_in_threadpool(ingest_document, temp_path, filename, replace, bank)
        # Registry menyimpan identitas bank dan metadata repository. Indeks sudah
        # dibangun oleh ingest_document, jadi tidak perlu rebuild kedua kali.
        await run_in_threadpool(repository.set_bank, filename, bank, False)
        return {**result, "bank": bank, "status": "active"}
    except ClientDisconnect as exc:
        raise HTTPException(status_code=499, detail="Upload dibatalkan karena koneksi browser terputus.") from exc
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post("/documents/check", status_code=201)
async def check_document(request: Request, bank: str = Query(...)) -> dict:
    try:
        bank = normalize_bank(bank)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    raw_name = request.headers.get("x-file-name", "")
    try:
        filename = validate_filename(raw_name)
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    temp_path: Path | None = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(prefix="tsd-check-", suffix=".docx", delete=False) as temp:
            temp_path = Path(temp.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="Ukuran file melebihi batas 30 MB.")
                temp.write(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail="File kosong.")
        return await run_in_threadpool(checker.check_document, temp_path, filename, bank)
    except ClientDisconnect as exc:
        raise HTTPException(status_code=499, detail="Upload dibatalkan karena koneksi browser terputus.") from exc
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post("/documents/checks/{report_id}/activate")
async def activate_checked_document(
    report_id: str,
    replace: bool = Query(False),
    bank: str = Query(..., min_length=1, max_length=60),
) -> dict:
    report = checker.load_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Hasil pemeriksaan tidak ditemukan.")
    if not report.get("eligible"):
        raise HTTPException(status_code=409, detail="Dokumen belum mencapai 100% dan tidak dapat diaktifkan.")
    staged = checker.STAGING_DIR / f"{report_id}.docx"
    if not staged.exists():
        raise HTTPException(status_code=409, detail="File pemeriksaan sudah tidak tersedia.")
    try:
        bank = normalize_bank(bank)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if report.get("bank") and report["bank"] != bank:
        raise HTTPException(status_code=409, detail="Bank dokumen berbeda dari bank saat pemeriksaan.")
    try:
        result = await run_in_threadpool(ingest_document, staged, report["filename"], replace, bank)
        confirmed_bank = await run_in_threadpool(repository.set_bank, report["filename"], bank, False)
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    report["bank"] = confirmed_bank
    checker.mark_activated(report)
    return {"report": report, "document": result}


@router.post("/documents/checks/{report_id}/recheck")
async def recheck_document(report_id: str) -> dict:
    try:
        return await run_in_threadpool(checker.recheck_report, report_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/sql-sources")
def get_sql_sources(bank: str = Query(...)) -> dict:
    try:
        return {"sources": list_sql_sources(normalize_bank(bank))}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/sql-sources/upload", status_code=201)
async def upload_sql_source(
    request: Request,
    bank: str = Query(...),
    replace: bool = Query(False),
) -> dict:
    try:
        bank = normalize_bank(bank)
        filename = validate_sql_filename(request.headers.get("x-file-name", ""))
    except (ValueError, SqlUploadError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    temp_path: Path | None = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(prefix="sql-upload-", suffix=".sql", delete=False) as temp:
            temp_path = Path(temp.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_SQL_BYTES:
                    raise HTTPException(status_code=413, detail="Ukuran skrip SQL melebihi batas 100 MB.")
                temp.write(chunk)
        return await run_in_threadpool(ingest_sql, temp_path, filename, bank, replace)
    except ClientDisconnect as exc:
        raise HTTPException(status_code=499, detail="Upload dibatalkan karena koneksi browser terputus.") from exc
    except DuplicateSqlError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SqlUploadError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.delete("/sql-sources/{filename}")
async def remove_sql_source(filename: str, bank: str = Query(...)) -> dict:
    try:
        return await run_in_threadpool(delete_sql_source, filename, normalize_bank(bank))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ValueError, SqlUploadError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/documents/{filename}/preview")
def preview_document(
    filename: str,
    bank: str = Query("SCB"),
    offset: int = Query(0, ge=0),
    limit: int = Query(80, ge=20, le=200),
) -> dict:
    try:
        return repository.preview(filename, normalize_bank(bank), offset=offset, limit=limit)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/documents/{filename}/metadata")
def update_document_metadata(filename: str, payload: DocumentMetadata) -> dict:
    try:
        return repository.update_metadata(filename, payload.filename, payload.module, payload.bank, payload.tags)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/documents/{filename}/download")
def download_document(filename: str, bank: str = Query("SCB")) -> FileResponse:
    try:
        path, _ = repository.document_path(filename, normalize_bank(bank))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/documents/{filename}/editor-config")
def document_editor_config(filename: str, bank: str = Query("SCB")) -> dict:
    try:
        return editor.editor_config(filename, normalize_bank(bank))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/documents/{filename}/editor-source")
def document_editor_source(filename: str, access_token: str = Query(...), bank: str = Query("SCB")) -> FileResponse:
    try:
        bank = normalize_bank(bank)
        editor.validate_source_token(filename, access_token, bank)
        path, _ = repository.document_path(filename, bank)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/documents/{filename}/editor-callback")
async def document_editor_callback(filename: str, request: Request, bank: str = Query("SCB")) -> dict:
    try:
        payload = await request.json()
        callback_token = (
            request.headers.get("authorizationjwt")
            or request.headers.get("authorization")
        )
        return await run_in_threadpool(
            editor.save_callback, filename, payload, callback_token, normalize_bank(bank)
        )
    except (ValueError, FileNotFoundError, requests.RequestException) as exc:
        return {"error": 1, "message": str(exc)}


@router.get("/documents/{filename}/pdf")
async def document_pdf(
    filename: str,
    download: bool = Query(False),
    bank: str = Query("SCB"),
) -> FileResponse:
    try:
        path = await run_in_threadpool(repository.pdf_path, filename, normalize_bank(bank))
        original = validate_filename(filename)
    except repository.PdfConverterUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    disposition = "attachment" if download else "inline"
    pdf_name = f"{Path(original).stem}.pdf"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=pdf_name,
        content_disposition_type=disposition,
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.post("/documents/{filename}/deactivate")
async def deactivate_document(filename: str, bank: str = Query("SCB")) -> dict:
    try:
        return await run_in_threadpool(repository.set_inactive, filename, normalize_bank(bank))
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/documents/{filename}/activate")
async def reactivate_document(filename: str, bank: str = Query("SCB")) -> dict:
    try:
        return await run_in_threadpool(repository.reactivate, filename, normalize_bank(bank))
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/documents/{filename}")
async def delete_document(filename: str, bank: str = Query("SCB")) -> dict:
    try:
        return await run_in_threadpool(repository.delete, filename, normalize_bank(bank))
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/review")
def get_review(limit: int = Query(12, ge=1, le=50), bank: str | None = Query(None)) -> dict:
    return _guard(index_db.review_items, limit=limit, bank=normalize_bank(bank) if bank else None)


@router.get("/segments/{segment}/spec-tables")
def get_spec_tables(segment: str, bank: str = Query("SCB")) -> dict:
    tables = _guard(index_db.spec_tables, segment, normalize_bank(bank))
    if not tables:
        raise HTTPException(
            status_code=404,
            detail="Tidak ada spesifikasi tabel untuk segment '%s'." % segment,
        )
    return {"segment": segment, "tables": tables}


@router.get("/tables/{table_name}")
def get_table_lineage(table_name: str, bank: str = Query("SCB")) -> dict:
    return _guard(index_db.table_lineage, table_name, normalize_bank(bank))
