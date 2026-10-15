"""Lokasi sumber dan artefak yang terisolasi untuk setiap bank."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.banks import normalize_bank


BASE_DIR = Path(__file__).resolve().parents[1]
LEGACY_SAMPLES_DIR = BASE_DIR / "samples"
LEGACY_PARSED_DIR = BASE_DIR / "storage" / "parsed"
LEGACY_REGISTRY = BASE_DIR / "storage" / "documents" / "registry.json"
BANKS_ROOT = BASE_DIR / "storage" / "banks"


@dataclass(frozen=True)
class BankPaths:
    bank: str
    documents: Path
    inactive_documents: Path
    sql: Path
    parsed_documents: Path
    parsed_sql: Path
    images: Path
    pdf: Path
    registry: Path

    def ensure(self) -> "BankPaths":
        for directory in (
            self.documents,
            self.inactive_documents,
            self.sql,
            self.parsed_documents,
            self.parsed_sql,
            self.images,
            self.pdf,
            self.registry.parent,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        return self


def paths_for(bank: str) -> BankPaths:
    """SCB mempertahankan volume lama; bank baru memakai namespace sendiri."""
    clean = normalize_bank(bank)
    if clean == "SCB":
        return BankPaths(
            bank=clean,
            documents=LEGACY_SAMPLES_DIR,
            inactive_documents=BASE_DIR / "storage" / "documents" / "inactive",
            sql=LEGACY_SAMPLES_DIR,
            parsed_documents=LEGACY_PARSED_DIR,
            parsed_sql=LEGACY_PARSED_DIR / "sql",
            images=BASE_DIR / "storage" / "images",
            pdf=BASE_DIR / "storage" / "documents" / "pdf",
            registry=LEGACY_REGISTRY,
        )

    root = BANKS_ROOT / clean
    return BankPaths(
        bank=clean,
        documents=root / "documents" / "active",
        inactive_documents=root / "documents" / "inactive",
        sql=root / "sql" / "active",
        parsed_documents=root / "parsed" / "documents",
        parsed_sql=root / "parsed" / "sql",
        images=BASE_DIR / "storage" / "images" / clean,
        pdf=root / "pdf",
        registry=root / "registry.json",
    )


def ensure_all_banks() -> None:
    for bank in ("SCB", "DBS", "SMBCI"):
        paths_for(bank).ensure()
