"""Endpoint HTTP untuk mesin pencari TSD.

Lapisan ini sengaja tipis: seluruh SQL ada di app/db/index_db.py, sehingga
rute di sini hanya memvalidasi input, memanggil satu fungsi, dan membentuk
balasan JSON.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.db import index_db

router = APIRouter(prefix="/api")

STATUS_VALUES = ("matched", "doc_only", "sql_only", "sql_variant")


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
    return _guard(index_db.stats)


@router.get("/search")
def get_search(
    q: str = Query(..., min_length=1, description="kata kunci atau nama SP"),
    status: str | None = Query(None),
    segment: str | None = Query(None),
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


@router.get("/segments")
def get_segments() -> dict:
    return {"segments": _guard(index_db.list_segments)}


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
