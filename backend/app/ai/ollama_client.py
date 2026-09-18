"""Analisis SP menggunakan Ollama lokal dengan keluaran terstruktur."""

from __future__ import annotations

import hashlib
import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import requests
from pydantic import BaseModel, Field

from app.parsers.sql_parser import GO_RE, parse_batch, read_sql


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")
PROMPT_VERSION = "sp-analysis-v3-sql-grounded"
MAX_CONTEXT_CHARS = 20_000
SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"


class OllamaUnavailableError(RuntimeError):
    pass


class AnalysisResult(BaseModel):
    summary: str = Field(description="Ringkasan fungsi SP dalam 2-4 kalimat")
    purpose: str = Field(description="Tujuan bisnis atau teknis utama")
    process_steps: list[str] = Field(description="Urutan proses yang didukung bukti")
    data_reads: list[str] = Field(description="Tabel atau data yang dibaca")
    data_writes: list[str] = Field(description="Tabel atau data yang ditulis")
    review_notes: list[str] = Field(description="Risiko, ketidakjelasan, atau hal yang perlu diverifikasi")
    confidence: Literal["rendah", "sedang", "tinggi"]


def _sql_fallback(context: dict[str, Any]) -> AnalysisResult:
    """Ringkasan konservatif saat model kecil gagal atau mulai mengarang."""
    name = context.get("stored_procedure") or "Stored procedure"
    sql = context.get("sql_definition") or ""
    reads = [item["table_name"] for item in context.get("source_tables", []) if item.get("table_name")]
    writes = [item["table_name"] for item in context.get("target_tables", []) if item.get("table_name")]
    params = [
        item.get("name") if isinstance(item, dict) else str(item)
        for item in context.get("parameters") or []
        if (item.get("name") if isinstance(item, dict) else item)
    ]
    read_only = bool(re.search(r"\bSELECT\b", sql, re.I)) and not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b", sql, re.I
    )
    audit_query = all(re.search(pattern, sql, re.I) for pattern in (r"ValueBefore", r"ValueAfter", r"JobHistory"))

    if audit_query:
        summary = (
            f"{name} menyajikan hasil pemeriksaan perubahan transaksi LLD tanpa mengubah "
            "data sumber. Query menghubungkan transaksi harian dengan riwayat job, detail "
            "audit, dan pengguna untuk memperlihatkan field yang berubah beserta nilai sebelum "
            "dan sesudah perubahan."
        )
        purpose = (
            "Menelusuri perubahan data transaksi LLD pada periode yang diminta dan menunjukkan "
            "siapa yang terakhir mengubahnya."
        )
        steps = [
            "Membaca transaksi harian sebagai data utama pemeriksaan.",
            "Mencocokkan transaksi dengan riwayat job transformasi dan catatan audit yang telah disetujui.",
            "Mengambil pengguna terakhir, field yang diedit, serta nilai sebelum dan sesudah perubahan.",
            "Menyaring transaksi LLD sesuai periode @DATE dan perubahan yang terjadi setelah job diperbarui.",
            "Mengurutkan hasil berdasarkan nomor rekening lalu mengembalikannya kepada pemanggil.",
        ]
    else:
        action = "membaca dan mengembalikan data" if read_only else "memproses data"
        scope = f" dari {len(reads)} tabel sumber" if reads else ""
        summary = f"{name} {action}{scope} berdasarkan kondisi yang tertulis pada SQL sumber."
        purpose = "Menjalankan fungsi teknis prosedur sesuai parameter dan relasi data yang tersedia."
        steps = []
        if reads:
            steps.append("Membaca data dari " + ", ".join(reads[:4]) + ".")
        if re.search(r"\bJOIN\b", sql, re.I):
            steps.append("Menggabungkan tabel sumber menggunakan kondisi JOIN pada SQL.")
        if re.search(r"\bWHERE\b", sql, re.I):
            suffix = " termasuk " + ", ".join(params) if params else ""
            steps.append("Menyaring data dengan kondisi WHERE" + suffix + ".")
        if writes:
            steps.append("Menulis hasil ke " + ", ".join(writes[:4]) + ".")
        elif read_only:
            steps.append("Mengembalikan hasil SELECT tanpa mengubah tabel permanen.")
        if re.search(r"\bORDER\s+BY\b", sql, re.I):
            steps.append("Mengurutkan hasil sesuai klausa ORDER BY.")

    return AnalysisResult(
        summary=summary,
        purpose=purpose,
        process_steps=steps[:6],
        data_reads=reads,
        data_writes=writes,
        review_notes=[],
        confidence="sedang" if sql else "rendah",
    )


def _is_weak(result: AnalysisResult) -> bool:
    text = " ".join([result.summary, result.purpose, *result.process_steps]).casefold()
    generic = ("efisiensi dan efektivitas", "dapat dioptimalkan", "analisis stored procedure")
    normalized_steps = {re.sub(r"\W+", " ", step.casefold()).strip() for step in result.process_steps}
    return any(term in text for term in generic) or len(normalized_steps) < min(2, len(result.process_steps))


def _request(method: str, path: str, **kwargs: Any) -> requests.Response:
    try:
        response = requests.request(
            method,
            f"{OLLAMA_BASE_URL}{path}",
            timeout=kwargs.pop("timeout", (3, 120)),
            **kwargs,
        )
        response.raise_for_status()
        return response
    except requests.RequestException as exc:
        raise OllamaUnavailableError(
            "Ollama belum dapat dihubungi. Buka aplikasi Ollama lalu coba lagi."
        ) from exc


def status() -> dict[str, Any]:
    try:
        payload = _request("GET", "/api/tags", timeout=(2, 5)).json()
    except (OllamaUnavailableError, ValueError):
        return {"available": False, "model": OLLAMA_MODEL, "installed": False}
    names = [model.get("name") for model in payload.get("models", []) if model.get("name")]
    return {
        "available": True,
        "model": OLLAMA_MODEL,
        "installed": OLLAMA_MODEL in names,
        "models": names,
    }


@lru_cache(maxsize=128)
def _procedure_sql(filename: str, sp_name: str) -> str | None:
    """Ambil batch SQL prosedur berdasarkan nama, bukan offset indeks lama."""
    path = SAMPLES_DIR / Path(filename).name
    if not path.is_file() or path.suffix.lower() != ".sql":
        return None
    text, _ = read_sql(path)
    text = text.replace("\r\n", "\n")
    pos = 0
    line = 1
    for match in GO_RE.finditer(text):
        batch = text[pos:match.start()]
        parsed = parse_batch(batch, line)
        if parsed and parsed["sp_name"].casefold() == sp_name.casefold():
            return batch.strip()
        line += text[pos:match.end()].count("\n")
        pos = match.end()
    batch = text[pos:]
    parsed = parse_batch(batch, line)
    if parsed and parsed["sp_name"].casefold() == sp_name.casefold():
        return batch.strip()
    return None


def build_context(sp: dict[str, Any]) -> dict[str, Any]:
    sql_body = None
    if sp.get("sql_file") and sp.get("sp_name"):
        sql_body = _procedure_sql(sp["sql_file"], sp["sp_name"])
    context = {
        "stored_procedure": sp.get("sp_name"),
        "status": sp.get("status"),
        "segment": sp.get("segment"),
        "database": sp.get("sql_database"),
        "sql_file": sp.get("sql_file"),
        "body_lines": sp.get("body_lines"),
        "parameters": sp.get("parameters"),
        "called_by": sp.get("called_by"),
        "document_explanation": sp.get("explanation"),
        "source_tables": sp.get("source_tables", []),
        "target_tables": sp.get("target_tables", []),
        "document_occurrences": sp.get("occurrences", []),
        "documented_calls": sp.get("calls_documented", []),
        "sql_definition": sql_body,
        "diagram_explanations": [
            {
                "kind": image.get("kind"),
                "segment": image.get("segment"),
                "explanation": image.get("explanation"),
            }
            for image in sp.get("images", [])
            if image.get("explanation")
        ],
    }
    encoded = json.dumps(context, ensure_ascii=False, sort_keys=True)
    if len(encoded) > MAX_CONTEXT_CHARS:
        context["document_explanation"] = (sp.get("explanation") or "")[:8_000]
        context["diagram_explanations"] = context["diagram_explanations"][:8]
        context["sql_definition"] = (sql_body or "")[:10_000]
    return context


def source_hash(context: dict[str, Any]) -> str:
    raw = json.dumps(context, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{PROMPT_VERSION}\n{raw}".encode()).hexdigest()


def _ground_result(result: AnalysisResult, context: dict[str, Any]) -> AnalysisResult:
    """Kunci fakta audit ke indeks; model hanya merangkum narasi dan urutan."""
    reads = [item["table_name"] for item in context["source_tables"] if item.get("table_name")]
    writes = [item["table_name"] for item in context["target_tables"] if item.get("table_name")]
    notes: list[str] = []
    if context.get("status") == "doc_only":
        notes.append("Definisi SQL tidak ditemukan; uraian ini hanya bersumber dari dokumen TSD.")
    elif context.get("status") == "sql_only":
        notes.append("Dokumen TSD tidak ditemukan; fungsi prosedur perlu diverifikasi dari SQL sumber.")
    if len(context.get("document_occurrences", [])) > 1:
        notes.append("Prosedur muncul di beberapa dokumen; cocokkan perbedaan uraian dan diagram antar-segment.")
    if any(item.get("confidence") == "low" for item in context.get("document_occurrences", [])):
        notes.append("Pencocokan dokumen memiliki confidence rendah dan perlu diperiksa manual.")
    sql = context.get("sql_definition") or ""
    has_write_statement = bool(re.search(r"\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b", sql, re.I))
    if not writes and has_write_statement:
        notes.append("Operasi tulis terlihat pada SQL, tetapi tabel tujuannya belum terdeteksi pada indeks.")
    elif not writes and not sql:
        notes.append("Tabel tujuan tidak terdeteksi; efek tulis belum dapat dipastikan tanpa SQL sumber.")
    if not context.get("document_explanation") and not context.get("diagram_explanations"):
        if sql:
            notes.append("Narasi TSD tidak tersedia; ringkasan diturunkan langsung dari SQL sumber.")
        else:
            notes.append("Narasi proses tidak tersedia; ringkasan hanya memakai metadata dan relasi tabel.")

    steps: list[str] = []
    seen_steps: set[str] = set()
    for raw in result.process_steps:
        item = re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", raw).strip()
        key = re.sub(r"\W+", " ", item.casefold()).strip()
        if item and key not in seen_steps:
            seen_steps.add(key)
            steps.append(item)
        if len(steps) == 6:
            break

    confidence: Literal["rendah", "sedang", "tinggi"] = "tinggi"
    if notes:
        confidence = "sedang"
    if context.get("status") in {"doc_only", "sql_only"} or any(
        item.get("confidence") == "low" for item in context.get("document_occurrences", [])
    ):
        confidence = "rendah"
    return result.model_copy(update={
        "data_reads": reads,
        "data_writes": writes,
        "review_notes": notes,
        "confidence": confidence,
        "process_steps": steps,
    })


def analyze(context: dict[str, Any]) -> AnalysisResult:
    state = status()
    if not state["available"]:
        raise OllamaUnavailableError(
            "Ollama belum berjalan. Buka aplikasi Ollama lalu coba lagi."
        )
    if not state["installed"]:
        raise OllamaUnavailableError(
            f"Model {OLLAMA_MODEL} belum terpasang. Jalankan: ollama pull {OLLAMA_MODEL}"
        )

    instruction = (
        "Anda adalah analis senior SQL Server. Jawab dalam Bahasa Indonesia yang lugas. "
        "Gunakan HANYA bukti dalam JSON, terutama sql_definition. Jelaskan perilaku yang "
        "benar-benar tampak dari SELECT, JOIN, WHERE, INSERT, UPDATE, DELETE, dan ORDER BY. "
        "Jangan mengarang tujuan optimasi, manfaat bisnis, atau proses yang tidak tertulis. "
        "Untuk SP tanpa TSD, simpulkan fungsi teknis dari SQL dan sebutkan bahwa makna bisnis "
        "masih perlu diverifikasi. Buat 2 sampai 6 process_steps yang unik dan konkret sesuai "
        "urutan eksekusi logis. Jangan menaruh angka, bullet, atau awalan 'langkah' di dalam "
        "teks process_steps. Jika SQL hanya SELECT, jangan menyatakan ada perubahan data. "
        "data_reads dan data_writes hanya boleh berisi nama dari data. Hindari kalimat generik "
        "seperti 'meningkatkan efisiensi dan efektivitas'. Keluarkan JSON sesuai schema."
    )
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": AnalysisResult.model_json_schema(),
        "messages": [
            {"role": "system", "content": instruction},
            {
                "role": "user",
                "content": "Analisis stored procedure berikut:\n" + json.dumps(context, ensure_ascii=False),
            },
        ],
        "options": {"temperature": 0, "num_predict": 600},
        "keep_alive": "10m",
    }
    try:
        response = _request("POST", "/api/chat", json=payload, timeout=(3, 45)).json()
        content = response["message"]["content"]
        result = AnalysisResult.model_validate_json(content)
        if context.get("sql_definition") and _is_weak(result):
            result = _sql_fallback(context)
        return _ground_result(result, context)
    except (KeyError, ValueError, OllamaUnavailableError) as exc:
        if context.get("sql_definition"):
            return _ground_result(_sql_fallback(context), context)
        if isinstance(exc, OllamaUnavailableError):
            raise
        raise OllamaUnavailableError(
            "Ollama mengembalikan format analisis yang tidak valid. Coba analisis ulang."
        ) from exc
