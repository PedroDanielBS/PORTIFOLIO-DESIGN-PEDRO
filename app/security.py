from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, Request, Response, UploadFile, status

from app.config import UPLOADS_DIR, settings

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32

RATE_LIMIT_MAX_ATTEMPTS = 5
RATE_LIMIT_WINDOW_MINUTES = 15

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".jfif", ".png", ".webp", ".avif", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(32)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, n_s, r_s, p_s, salt_hex, hash_hex = stored_hash.split("$")
        if algo != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n_s),
            r=int(r_s),
            p=int(p_s),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def hash_session_token(raw_token: str) -> str:
    return hmac.new(
        settings.SESSION_SECRET.encode("utf-8"),
        raw_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return "unknown"


def check_rate_limit(conn: sqlite3.Connection, ip: str) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)).isoformat()
    row = conn.execute(
        """
        SELECT COUNT(*) AS fail_count, MIN(attempted_at) AS oldest
        FROM login_attempts
        WHERE ip = ? AND success = 0 AND attempted_at >= ?
        """,
        (ip, cutoff),
    ).fetchone()
    if row and row["fail_count"] >= RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_MINUTES * 60)},
        )


def record_login_attempt(
    conn: sqlite3.Connection, ip: str, email: str, success: bool
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO login_attempts (ip, email_attempted, success, attempted_at)
        VALUES (?, ?, ?, ?)
        """,
        (ip, email[:120], 1 if success else 0, now),
    )
    # Prune attempts older than 30 days
    prune_cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    conn.execute("DELETE FROM login_attempts WHERE attempted_at < ?", (prune_cutoff,))


def create_session(
    conn: sqlite3.Connection,
    user_id: int,
    request: Request,
    response: Response,
    remember: bool = False,
) -> dict[str, Any]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_session_token(raw_token)
    csrf_token = secrets.token_urlsafe(32)
    ttl_hours = settings.SESSION_REMEMBER_HOURS if remember else settings.SESSION_TTL_HOURS
    now_dt = datetime.now(timezone.utc)
    expires_dt = now_dt + timedelta(hours=ttl_hours)

    conn.execute(
        """
        INSERT INTO admin_sessions (
            token_hash, csrf_token, user_id, ip, user_agent, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            token_hash,
            csrf_token,
            user_id,
            get_client_ip(request),
            request.headers.get("user-agent", "")[:240],
            expires_dt.isoformat(),
            now_dt.isoformat(),
        ),
    )

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        max_age=ttl_hours * 3600,
        path="/",
    )
    return {"csrf_token": csrf_token, "expires_at": expires_dt.isoformat()}


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
    )


def get_valid_session(
    conn: sqlite3.Connection, request: Request
) -> Optional[sqlite3.Row]:
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not raw_token or len(raw_token) < 20:
        return None
    token_hash = hash_session_token(raw_token)
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now_iso,))
    row = conn.execute(
        """
        SELECT s.*, u.email
        FROM admin_sessions s
        JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        """,
        (token_hash, now_iso),
    ).fetchone()
    return row


def verify_csrf(request: Request, session_row: sqlite3.Row) -> None:
    header_token = request.headers.get("x-csrf-token", "")
    if not header_token or not hmac.compare_digest(header_token, session_row["csrf_token"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token CSRF inválido ou ausente.",
        )


def _validate_magic_bytes(head: bytes, ext: str) -> bool:
    if ext in (".jpg", ".jpeg", ".jfif"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if ext == ".webp":
        return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext == ".avif":
        return b"ftyp" in head[:32]
    if ext in (".mp4", ".mov"):
        return len(head) >= 12 and head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free")
    if ext == ".webm":
        return head.startswith(b"\x1a\x45\xdf\xa3")
    return False


async def save_validated_upload(file: UploadFile) -> dict[str, Any]:
    original_name = Path(file.filename or "file").name
    ext = Path(original_name).suffix.lower()

    if ext in IMAGE_EXTENSIONS:
        media_kind = "image"
        max_bytes = settings.MAX_IMAGE_BYTES
    elif ext in VIDEO_EXTENSIONS:
        media_kind = "video"
        max_bytes = settings.MAX_VIDEO_BYTES
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato não suportado. Envie JPG, PNG, WebP, AVIF, GIF, MP4, WebM ou MOV.",
        )

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{secrets.token_hex(16)}{ext}"
    dest = UPLOADS_DIR / safe_name

    total_size = 0
    first_chunk = b""
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 512)
                if not chunk:
                    break
                if not first_chunk:
                    first_chunk = chunk[:64]
                    if not _validate_magic_bytes(first_chunk, ext):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Conteúdo do arquivo não corresponde à extensão declarada.",
                        )
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Arquivo excede o limite de {max_bytes // (1024 * 1024)} MB.",
                    )
                out.write(chunk)
        if total_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arquivo vazio.",
            )
    except HTTPException:
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise
    except Exception:
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao salvar arquivo.",
        )

    return {
        "url": f"/uploads/{safe_name}",
        "type": media_kind,
        "filename": safe_name,
        "size": total_size,
    }
