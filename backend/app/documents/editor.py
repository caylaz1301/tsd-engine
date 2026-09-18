"""Konfigurasi dan callback ONLYOFFICE untuk penyuntingan DOCX tersinkron."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import socket
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.parse import urlparse

import requests

from app.documents import repository
from app.indexer.ingest import MAX_FILE_BYTES


JWT_SECRET = os.getenv("ONLYOFFICE_JWT_SECRET", "change-this-onlyoffice-secret")
BACKEND_INTERNAL_URL = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000").rstrip("/")
ONLYOFFICE_INTERNAL_URL = os.getenv(
    "ONLYOFFICE_INTERNAL_URL", "http://documentserver"
).rstrip("/")


def _part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def encode_token(payload: dict[str, Any]) -> str:
    header = _part(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _part(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    signature = hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_part(signature)}"


def decode_token(token: str) -> dict[str, Any]:
    try:
        header, body, signature = token.split(".")
        expected = _part(
            hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Tanda tangan token editor tidak valid.")
        padding = "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(body + padding))
        if payload.get("exp") and int(payload["exp"]) < int(time.time()):
            raise ValueError("Token editor sudah kedaluwarsa.")
        return payload
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Token editor tidak valid.") from exc


def editor_config(filename: str) -> dict[str, Any]:
    path, status = repository.document_path(filename)
    if status != "active":
        raise ValueError("Dokumen harus aktif sebelum dapat diedit.")
    version = f"editor-v2:{path.name}:{path.stat().st_size}:{path.stat().st_mtime_ns}"
    key = hashlib.sha256(version.encode()).hexdigest()[:40]
    source_token = encode_token({
        "filename": path.name,
        "purpose": "editor-source",
        "exp": int(time.time()) + 6 * 60 * 60,
    })
    config: dict[str, Any] = {
        "documentType": "word",
        "type": "desktop",
        "height": "100%",
        "width": "100%",
        "document": {
            "fileType": "docx",
            "key": key,
            "title": path.name,
            "url": (
                f"{BACKEND_INTERNAL_URL}/api/documents/{quote(path.name, safe='')}/editor-source"
                f"?access_token={source_token}"
            ),
            "permissions": {
                "edit": True,
                "download": True,
                "print": True,
                "review": True,
            },
        },
        "editorConfig": {
            "callbackUrl": f"{BACKEND_INTERNAL_URL}/api/documents/{quote(path.name, safe='')}/editor-callback",
            "lang": "id",
            "mode": "edit",
            "user": {"id": "local-user", "name": "Pengguna TSD Engine"},
            "customization": {
                "autosave": True,
                "compactHeader": True,
                "forcesave": True,
            },
        },
    }
    config["token"] = encode_token(config)
    return config


def validate_source_token(filename: str, token: str) -> None:
    payload = decode_token(token)
    if payload.get("purpose") != "editor-source" or payload.get("filename") != Path(filename).name:
        raise ValueError("Token tidak berlaku untuk dokumen ini.")


def save_callback(
    filename: str, payload: dict[str, Any], callback_token: str | None = None
) -> dict[str, int]:
    token = payload.get("token") or callback_token
    if not isinstance(token, str):
        raise ValueError("Callback editor tidak memiliki token.")
    if token.lower().startswith("bearer "):
        token = token[7:]
    decode_token(token)
    status = int(payload.get("status", 0))
    if status not in (2, 6):
        return {"error": 0}
    download_url = payload.get("url")
    if not isinstance(download_url, str):
        raise ValueError("Alamat hasil editor tidak diizinkan.")
    download_url = _internal_download_url(download_url)

    response = requests.get(download_url, stream=True, timeout=(10, 180))
    response.raise_for_status()
    temp = repository.ACTIVE_DIR / f".{Path(filename).name}.onlyoffice.tmp"
    size = 0
    try:
        with temp.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise ValueError("Dokumen hasil edit melebihi batas 30 MB.")
                output.write(chunk)
        repository.replace_from_editor(filename, temp)
    finally:
        temp.unlink(missing_ok=True)
    return {"error": 0}


def _internal_download_url(url: str) -> str:
    """Arahkan URL cache hasil callback melalui hostname internal Docker."""
    parsed = urlparse(url)
    expected = urlparse(ONLYOFFICE_INTERNAL_URL)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or not parsed.path.startswith("/"):
        raise ValueError("Alamat hasil editor tidak diizinkan.")
    allowed_hosts = {expected.hostname, "localhost", "127.0.0.1"}
    try:
        allowed_hosts.update({
            item[4][0]
            for item in socket.getaddrinfo(expected.hostname, expected.port or 80)
        })
    except socket.gaierror:
        pass
    if parsed.hostname not in allowed_hosts:
        raise ValueError("Alamat hasil editor tidak diizinkan.")
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{ONLYOFFICE_INTERNAL_URL}{parsed.path}{query}"
