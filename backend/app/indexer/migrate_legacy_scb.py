"""Beri label SCB pada sumber yang sudah ada sebelum fitur multi-bank dipakai."""

from __future__ import annotations

import json
from pathlib import Path

from app.banks import KNOWN_BANKS

ROOT = Path("storage/documents")
REGISTRY_PATH = ROOT / "registry.json"


def migrate() -> int:
    try:
        registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        registry = {"documents": {}}
    records = registry.setdefault("documents", {})
    filenames = set(records)
    filenames.update(path.name for path in Path("samples").glob("*.docx"))
    filenames.update(path.name for path in (ROOT / "inactive").glob("*.docx"))

    changed = 0
    for filename in filenames:
        record = records.setdefault(filename, {})
        if record.get("bank") in KNOWN_BANKS:
            continue
        record["bank"] = "SCB"
        record["bank_source"] = "legacy_scb_migration"
        changed += 1

    if changed:
        ROOT.mkdir(parents=True, exist_ok=True)
        temporary = REGISTRY_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(REGISTRY_PATH)
    report_dir = Path("storage/quality/reports")
    for path in report_dir.glob("*.json"):
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if report.get("bank") in KNOWN_BANKS:
            continue
        report["bank"] = "SCB"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(path)
    return changed


if __name__ == "__main__":
    print(f"Migrasi SCB: {migrate()} dokumen diberi label SCB.")
