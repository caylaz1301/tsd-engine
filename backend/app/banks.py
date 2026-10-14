"""Deteksi konservatif dan normalisasi institusi pemilik dokumen TSD."""

from __future__ import annotations

import re

UNKNOWN_BANK = "Belum ditentukan"

KNOWN_BANKS = (
    "Bank Indonesia",
    "Bank Mandiri",
    "Bank Rakyat Indonesia",
    "Bank Negara Indonesia",
    "Bank Tabungan Negara",
    "Bank Central Asia",
    "Bank Syariah Indonesia",
    "CIMB Niaga",
    "OCBC Indonesia",
    "PermataBank",
    "Bank Danamon",
    "Maybank Indonesia",
    "Bank Mega",
    "Bank BTPN",
    "Bank Muamalat",
    "Bank Panin",
    "Bank Jago",
    "SeaBank Indonesia",
)

ALIASES = {
    "BI": "Bank Indonesia",
    "MANDIRI": "Bank Mandiri",
    "BRI": "Bank Rakyat Indonesia",
    "BNI": "Bank Negara Indonesia",
    "BTN": "Bank Tabungan Negara",
    "BCA": "Bank Central Asia",
    "BSI": "Bank Syariah Indonesia",
    "CIMB": "CIMB Niaga",
    "CIMB NIAGA": "CIMB Niaga",
    "OCBC": "OCBC Indonesia",
    "OCBC NISP": "OCBC Indonesia",
    "PERMATABANK": "PermataBank",
    "PERMATA": "PermataBank",
    "DANAMON": "Bank Danamon",
    "MAYBANK": "Maybank Indonesia",
    "BANK MEGA": "Bank Mega",
    "BTPN": "Bank BTPN",
    "MUAMALAT": "Bank Muamalat",
    "PANIN": "Bank Panin",
    "JAGO": "Bank Jago",
    "SEABANK": "SeaBank Indonesia",
}

LABEL_RE = re.compile(
    r"\b(?:nama\s+bank|bank\s+name|nama\s+institusi|institution\s+name)\s*[:\-]\s*"
    r"([A-Za-z][A-Za-z0-9&.,'() -]{2,60})",
    re.IGNORECASE,
)


def normalize_bank(value: str) -> str:
    clean = " ".join(value.strip().split()).strip("-–—:;,. ")
    if not clean:
        raise ValueError("Bank wajib dipilih.")
    if len(clean) > 60:
        raise ValueError("Nama bank maksimal 60 karakter.")
    return ALIASES.get(clean.upper(), clean)


def detect_bank(filename: str, text: str) -> dict[str, object]:
    """Kembalikan satu saran; nilai rendah tidak otomatis dianggap benar."""
    haystacks = ((filename.replace("_", " "), "filename"), (text[:20_000], "document"))
    candidates: list[str] = []
    for haystack, source in haystacks:
        upper = haystack.upper()
        names = ALIASES.items() if source == "filename" else ()
        for alias, canonical in sorted(names, key=lambda item: -len(item[0])):
            if re.search(rf"(?<![A-Z0-9]){re.escape(alias.upper())}(?![A-Z0-9])", upper):
                if canonical not in candidates:
                    candidates.append(canonical)
        labelled = LABEL_RE.search(haystack)
        if labelled:
            raw_value = labelled.group(1).splitlines()[0].strip()
            if len(raw_value) > 60:
                continue
            value = normalize_bank(raw_value)
            if value not in candidates:
                candidates.insert(0, value)
            return {
                "suggestion": value,
                "confidence": "high",
                "source": source,
                "candidates": candidates,
            }
    if len(candidates) == 1:
        return {"suggestion": candidates[0], "confidence": "medium", "source": "content", "candidates": candidates}
    return {"suggestion": UNKNOWN_BANK, "confidence": "low", "source": None, "candidates": candidates}


def bank_options(extra: list[str] | None = None) -> list[str]:
    values = set(KNOWN_BANKS)
    values.update(value for value in (extra or []) if value and value != UNKNOWN_BANK)
    return sorted(values, key=str.casefold)
