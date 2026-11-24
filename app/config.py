from __future__ import annotations

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
ADMIN_STATIC_DIR = BASE_DIR / "admin_static"
DB_PATH = DATA_DIR / "portfolio.db"


def _load_dotenv(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")


def _normalize_admin_path(raw: str) -> str:
    cleaned = "/" + raw.strip().strip("/")
    if cleaned in ("/", "/api", "/static", "/uploads", "/admin-assets"):
        return "/studio-admin"
    return cleaned


class Settings:
    ADMIN_PATH: str = _normalize_admin_path(os.getenv("ADMIN_PATH", "/studio-admin"))
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "Pedrodanielbonfa@gmail.com").strip().lower()
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "") or secrets.token_urlsafe(48)

    # Auto-enable Secure cookies on Vercel/HTTPS
    IS_VERCEL: bool = os.getenv("VERCEL", "") in ("1", "true", "TRUE")
    COOKIE_SECURE: bool = (
        os.getenv("COOKIE_SECURE", "true" if IS_VERCEL else "false").lower() in ("1", "true", "yes")
    )
    SESSION_COOKIE_NAME: str = "__Host-pd_session" if COOKIE_SECURE else "pd_session"
    SESSION_TTL_HOURS: int = 24
    SESSION_REMEMBER_HOURS: int = 24 * 7

    # Supabase Cloud Backend (used on Vercel / production)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    SUPABASE_BUCKET: str = os.getenv("SUPABASE_BUCKET", "portfolio-media").strip() or "portfolio-media"
    USE_SUPABASE: bool = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

    MAX_IMAGE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    MAX_VIDEO_BYTES: int = 120 * 1024 * 1024  # 120 MB
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))


settings = Settings()
