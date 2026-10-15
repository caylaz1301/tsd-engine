"""Identitas bank yang didukung oleh instalasi TSD Engine ini."""

from __future__ import annotations

import re

UNKNOWN_BANK = "Belum ditentukan"
KNOWN_BANKS = ("SCB", "DBS", "SMBCI")

ALIASES = {
    "SCB": "SCB",
    "STANDARD CHARTERED": "SCB",
    "STANDARD CHARTERED BANK": "SCB",
    "DBS": "DBS",
    "DBS BANK": "DBS",
    "SMBCI": "SMBCI",
    "SMBC INDONESIA": "SMBCI",
    "BANK SMBC INDONESIA": "SMBCI",
}

LABEL_RE = re.compile(
    r"\b(?:nama\s+bank|bank\s+name|nama\s+institusi|institution\s+name)\s*[:\-]\s*"
    r"([^\r\n]{2,80})",
    re.IGNORECASE,
)


def normalize_bank(value: str) -> str:
    clean = " ".join(value.strip().split()).strip("-:;,. ")
    bank = ALIASES.get(clean.upper())
    if bank is None:
        raise ValueError("Pilih SCB, DBS, atau SMBCI.")
    return bank


def detect_bank(filename: str, text: str) -> dict[str, object]:
    """Saran hanya memakai nama file atau label pemilik yang eksplisit."""
    match = LABEL_RE.search(text[:20_000])
    if match:
        try:
            bank = normalize_bank(match.group(1))
            return {"suggestion": bank, "confidence": "high", "source": "document", "candidates": [bank]}
        except ValueError:
            pass

    normalized_name = filename.upper().replace("_", " ")
    candidates = [
        bank for alias, bank in ALIASES.items()
        if re.search(rf"(?<![A-Z0-9]){re.escape(alias)}(?![A-Z0-9])", normalized_name)
    ]
    unique = list(dict.fromkeys(candidates))
    if len(unique) == 1:
        return {"suggestion": unique[0], "confidence": "medium", "source": "filename", "candidates": unique}
    return {"suggestion": UNKNOWN_BANK, "confidence": "low", "source": None, "candidates": unique}


def bank_options(extra: list[str] | None = None) -> list[str]:
    return list(KNOWN_BANKS)
