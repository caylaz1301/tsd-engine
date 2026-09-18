"""Normalisasi nama modul dari metadata REGLA yang tidak selalu konsisten."""

from __future__ import annotations

import re


KNOWN_MODULES = (
    "BASEL-3", "ANTASENA", "SLIK_HIST", "STAGING", "LBBU", "SCV",
    "LLD", "LLL", "RWA", "ALCO", "SLIK", "A01", "DM",
)


def infer_module(*values: str | None) -> str:
    text = " ".join(value or "" for value in values).upper()
    normalized = re.sub(r"[^A-Z0-9]+", "_", text)
    if "BASEL_3" in normalized or "BASEL3" in normalized:
        return "BASEL-3"
    if re.search(r"(?:^|_)STG(?:_|$)", normalized):
        return "STAGING"
    for module in KNOWN_MODULES[1:]:
        if re.search(rf"(?:^|_){re.escape(module)}(?:_|$)", normalized):
            return module
    database = next((value for value in values if value and value.upper().startswith("REGLA_")), None)
    return database.upper().removeprefix("REGLA_") if database else "LAINNYA"
