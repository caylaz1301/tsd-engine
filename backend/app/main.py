"""Titik masuk FastAPI untuk mesin pencari TSD.

Jalankan dari folder backend:
    uvicorn app.main:app --reload --port 8000

Dokumentasi interaktif tersedia di http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.db import index_db

# Frontend Next.js berjalan di port terpisah saat pengembangan, jadi asalnya
# harus diizinkan secara eksplisit. Daftar ini sengaja tidak memakai tanda
# bintang supaya tidak terbawa ke lingkungan produksi.
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",")
    if origin.strip()
]

app = FastAPI(
    title="TSD Search Engine",
    description=(
        "Pencarian stored procedure di dokumen TSD beserta diagram, "
        "spesifikasi tabel, dan perbandingannya dengan script SQL produksi."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

app.include_router(router)

# Diagram ERD dan Data Flow hasil ekstraksi docx disajikan langsung sebagai
# file statis. Folder dibuat kalau belum ada, karena StaticFiles menolak
# dipasang pada direktori yang tidak ada dan itu akan menggagalkan startup.
index_db.IMAGES_DIR.mkdir(parents=True, exist_ok=True)
app.mount(
    "/images",
    StaticFiles(directory=index_db.IMAGES_DIR),
    name="images",
)


@app.get("/")
def root() -> dict:
    return {
        "name": "TSD Search Engine API",
        "docs": "/docs",
        "health": "/api/health",
    }
