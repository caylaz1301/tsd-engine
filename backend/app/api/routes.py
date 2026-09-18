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
from app.quality import checker
from app.documents import repository
from app.documents import editor
from app import exports

router = APIRouter(prefix="/api")

STATUS_VALUES = ("matched", "doc_only", "sql_only", "sql_variant")


class DocumentMetadata(BaseModel):
    filename: str = Field(min_length=6, max_length=185)
    module: str = Field(min_length=1, max_length=40)
    tags: list[str] = Field(default_factory=list, max_length=10)


def _guard(fn, *args, **kwargs):
    """Ubah indeks yang belum dibangun menjadi galat HTTP yang jelas."""
    try:
        return fn(*args, **kwargs)
    except index_db.IndexMissingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict:
    ready = index_db.DB_PATH.exists()
    return {
        "status": "ok" if ready else "index_missing",
        "index_path": str(index_db.DB_PATH),
        "index_ready": ready,
    }


@router.get("/stats")
def get_stats() -> dict:
    result = _guard(index_db.stats)
    reports = checker.list_reports()
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
    hide_variants: bool = Query(False, description="sembunyikan salinan arsip"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
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
        hide_variants=hide_variants,
        limit=limit,
        offset=offset,
    )


@router.get("/sp/{sp_name}")
def get_sp(sp_name: str) -> dict:
    sp = _guard(index_db.get_sp, sp_name)
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
def analyze_sp(sp_name: str, refresh: bool = Query(False)) -> dict:
    sp = _guard(index_db.get_sp, sp_name)
    if sp is None:
        raise HTTPException(status_code=404, detail="Stored procedure tidak ada di indeks.")

    context = ollama_client.build_context(sp)
    digest = ollama_client.source_hash(context)
    if not refresh:
        cached = ai_cache.get(sp_name, digest, ollama_client.OLLAMA_MODEL)
        if cached:
            return {**cached, "model": ollama_client.OLLAMA_MODEL, "cached": True}

    try:
        analysis = ollama_client.analyze(context).model_dump()
    except ollama_client.OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    created_at = ai_cache.put(sp_name, digest, ollama_client.OLLAMA_MODEL, analysis)
    return {
        "analysis": analysis,
        "model": ollama_client.OLLAMA_MODEL,
        "created_at": created_at,
        "cached": False,
    }


@router.get("/sp/{sp_name}/report.pdf")
def export_sp_report(sp_name: str) -> FileResponse:
    sp = _guard(index_db.get_sp, sp_name)
    if sp is None:
        raise HTTPException(status_code=404, detail="Stored procedure tidak ada di indeks.")
    context = ollama_client.build_context(sp)
    digest = ollama_client.source_hash(context)
    cached = ai_cache.get(sp_name, digest, ollama_client.OLLAMA_MODEL)
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
def get_segments() -> dict:
    active = _guard(index_db.list_segments)
    repository.sync_registry(active)
    return {"segments": [*repository.enrich_documents(active), *repository.inactive_documents()]}


@router.get("/modules")
def get_modules() -> dict:
    return {"modules": _guard(index_db.list_modules)}


@router.get("/documents/checks")
def get_document_checks() -> dict:
    return {"reports": checker.list_reports(limit=10)}


@router.post("/documents/check", status_code=201)
async def check_document(request: Request) -> dict:
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
        return await run_in_threadpool(checker.check_document, temp_path, filename)
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post("/documents/checks/{report_id}/activate")
async def activate_checked_document(report_id: str, replace: bool = Query(False)) -> dict:
    report = checker.load_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Hasil pemeriksaan tidak ditemukan.")
    if not report.get("eligible"):
        raise HTTPException(status_code=409, detail="Dokumen belum mencapai 100% dan tidak dapat diaktifkan.")
    staged = checker.STAGING_DIR / f"{report_id}.docx"
    if not staged.exists():
        raise HTTPException(status_code=409, detail="File pemeriksaan sudah tidak tersedia.")
    try:
        result = await run_in_threadpool(ingest_document, staged, report["filename"], replace)
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
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


@router.post("/documents/upload", status_code=201)
async def upload_document(
    request: Request,
    replace: bool = Query(False),
) -> dict:
    raw_name = request.headers.get("x-file-name", "")
    try:
        filename = validate_filename(raw_name)
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            too_large = int(content_length) > MAX_FILE_BYTES
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Content-Length tidak valid.") from exc
        if too_large:
            raise HTTPException(status_code=413, detail="Ukuran file melebihi batas 30 MB.")

    temp_path: Path | None = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(
            prefix="tsd-upload-", suffix=".docx", delete=False
        ) as temp:
            temp_path = Path(temp.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(
                        status_code=413, detail="Ukuran file melebihi batas 30 MB."
                    )
                temp.write(chunk)

        return await run_in_threadpool(ingest_document, temp_path, filename, replace)
    except DuplicateDocumentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Dokumen tersimpan tetapi gagal diproses. File lama dipulihkan bila tersedia.",
        ) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.get("/documents/{filename}/preview")
def preview_document(
    filename: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(80, ge=20, le=200),
) -> dict:
    try:
        return repository.preview(filename, offset=offset, limit=limit)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/documents/{filename}/metadata")
def update_document_metadata(filename: str, payload: DocumentMetadata) -> dict:
    try:
        return repository.update_metadata(filename, payload.filename, payload.module, payload.tags)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/documents/{filename}/download")
def download_document(filename: str) -> FileResponse:
    try:
        path, _ = repository.document_path(filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path,
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.get("/documents/{filename}/editor-config")
def document_editor_config(filename: str) -> dict:
    try:
        return editor.editor_config(filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/documents/{filename}/editor-source")
def document_editor_source(filename: str, access_token: str = Query(...)) -> FileResponse:
    try:
        editor.validate_source_token(filename, access_token)
        path, _ = repository.document_path(filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/documents/{filename}/editor-callback")
async def document_editor_callback(filename: str, request: Request) -> dict:
    try:
        payload = await request.json()
        callback_token = (
            request.headers.get("authorizationjwt")
            or request.headers.get("authorization")
        )
        return await run_in_threadpool(
            editor.save_callback, filename, payload, callback_token
        )
    except (ValueError, FileNotFoundError, requests.RequestException) as exc:
        return {"error": 1, "message": str(exc)}


@router.get("/documents/{filename}/pdf")
async def document_pdf(filename: str, download: bool = Query(False)) -> FileResponse:
    try:
        path = await run_in_threadpool(repository.pdf_path, filename)
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
async def deactivate_document(filename: str) -> dict:
    try:
        return await run_in_threadpool(repository.set_inactive, filename)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/documents/{filename}/activate")
async def reactivate_document(filename: str) -> dict:
    try:
        return await run_in_threadpool(repository.reactivate, filename)
    except (FileNotFoundError, FileExistsError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/documents/{filename}")
async def delete_document(filename: str) -> dict:
    try:
        return await run_in_threadpool(repository.delete, filename)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/review")
def get_review(limit: int = Query(12, ge=1, le=50)) -> dict:
    return _guard(index_db.review_items, limit=limit)


@router.get("/segments/{segment}/spec-tables")
def get_spec_tables(segment: str) -> dict:
    tables = _guard(index_db.spec_tables, segment)
    if not tables:
        raise HTTPException(
            status_code=404,
            detail="Tidak ada spesifikasi tabel untuk segment '%s'." % segment,
        )
    return {"segment": segment, "tables": tables}


@router.get("/tables/{table_name}")
def get_table_lineage(table_name: str) -> dict:
    return _guard(index_db.table_lineage, table_name)
