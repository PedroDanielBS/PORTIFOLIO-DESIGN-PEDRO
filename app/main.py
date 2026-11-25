from __future__ import annotations

import json
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.config import ADMIN_STATIC_DIR, STATIC_DIR, TEMPLATES_DIR, UPLOADS_DIR, settings
from app.schemas import (
    ExperiencePayload,
    LoginPayload,
    PasswordChangePayload,
    ProfilePayload,
    ProjectPayload,
    ReorderPayload,
    SetupPayload,
    SignedUploadPayload,
)
from app.security import (
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    clear_session_cookie,
    get_client_ip,
    hash_password,
    hash_session_token,
    save_validated_upload,
    verify_csrf,
    verify_password,
)
from app import store


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_storage()
    yield


app = FastAPI(
    title="Pedro Daniel — Design Portfolio",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        is_private = path.startswith("/api/admin") or path.startswith(settings.ADMIN_PATH)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                extra = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                    (
                        b"content-security-policy",
                        (
                            "default-src 'self'; "
                            "script-src 'self' https://unpkg.com; "
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                            "font-src 'self' https://fonts.gstatic.com data:; "
                            "img-src 'self' data: blob: https:; "
                            "media-src 'self' blob: https:; "
                            "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; "
                            "connect-src 'self' https://*.supabase.co; "
                            "object-src 'none'; "
                            "base-uri 'self'; "
                            "frame-ancestors 'none';"
                        ).encode("ascii"),
                    ),
                ]
                if is_private:
                    extra.extend(
                        [
                            (b"cache-control", b"no-store, no-cache, must-revalidate, private"),
                            (b"pragma", b"no-cache"),
                        ]
                    )
                existing_keys = {k.lower() for k, _ in headers}
                for k, v in extra:
                    if k not in existing_keys:
                        headers.append((k, v))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeadersMiddleware)

if not settings.IS_VERCEL:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    ADMIN_STATIC_DIR.mkdir(parents=True, exist_ok=True)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", "", value.lower()).strip()
    cleaned = re.sub(r"[\s_-]+", "-", cleaned)
    return cleaned[:60] or "projeto"


def _issue_session(user_id: int, request: Request, response: Response, remember: bool = False) -> dict[str, Any]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_session_token(raw_token)
    csrf_token = secrets.token_urlsafe(32)
    ttl_hours = settings.SESSION_REMEMBER_HOURS if remember else settings.SESSION_TTL_HOURS
    now_dt = datetime.now(timezone.utc)
    expires_dt = now_dt + timedelta(hours=ttl_hours)

    store.save_session(
        token_hash=token_hash,
        csrf_token=csrf_token,
        user_id=user_id,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:240],
        expires_at=expires_dt.isoformat(),
        created_at=now_dt.isoformat(),
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


def _current_session(request: Request):
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return store.find_valid_session(raw_token)


def require_admin_session(request: Request) -> dict[str, Any]:
    session = _current_session(request)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária.",
        )
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        verify_csrf(request, session)
    return session


# ─────────────────────────────────────────────────────────────────────────────
# Public Pages & Local Upload Serving
# ─────────────────────────────────────────────────────────────────────────────

from html import escape as html_escape

@app.get("/", response_class=HTMLResponse)
async def public_home() -> HTMLResponse:
    html = (TEMPLATES_DIR / "index.html").read_text(encoding="utf-8")
    avatar = "/static/assets/pedro-profile.jpg"
    try:
        profile = store.get_profile()
        saved = (profile.get("avatar_url") or "").strip()
        if saved.startswith(("/", "https://", "http://")):
            avatar = saved
    except Exception:
        pass
    html = html.replace("__PROFILE_PHOTO_URL__", html_escape(avatar, quote=True))
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")
    target = (UPLOADS_DIR / filename).resolve()
    if not str(target).startswith(str(UPLOADS_DIR.resolve())) or not target.is_file():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return FileResponse(
        path=target,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public Portfolio API (STRICTLY published & public data only — zero admin info)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/public/portfolio")
async def get_public_portfolio(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    profile = store.get_profile()
    projects = store.list_projects(only_published=True)
    experiences = store.list_experiences(only_visible=True)

    # Strip internal admin timestamps from public API
    for p in projects:
        p.pop("created_at", None)
        p.pop("updated_at", None)
        p.pop("status", None)
    for e in experiences:
        e.pop("created_at", None)
        e.pop("updated_at", None)
        e.pop("visible", None)

    return {
        "profile": profile,
        "projects": projects,
        "experiences": experiences,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Secret Admin Entry & Protected Admin Assets
# ─────────────────────────────────────────────────────────────────────────────

@app.get(settings.ADMIN_PATH, response_class=HTMLResponse)
async def admin_portal(request: Request) -> HTMLResponse:
    has_admin = store.has_any_admin()
    session = _current_session(request)

    if not session:
        html = (TEMPLATES_DIR / "admin_login.html").read_text(encoding="utf-8")
        html = html.replace("__SETUP_MODE__", "false" if has_admin else "true")
        html = html.replace("__ADMIN_PATH__", settings.ADMIN_PATH)
        return HTMLResponse(content=html)

    html = (TEMPLATES_DIR / "admin_dashboard.html").read_text(encoding="utf-8")
    html = html.replace("__CSRF_TOKEN__", session["csrf_token"])
    html = html.replace("__ADMIN_EMAIL__", session["email"])
    html = html.replace("__ADMIN_PATH__", settings.ADMIN_PATH)
    return HTMLResponse(content=html)


@app.get("/admin-assets/{filename}")
async def serve_protected_admin_asset(filename: str, _: dict = Depends(require_admin_session)):
    """Admin JS bundle is NEVER accessible without a valid server-side session."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Inválido.")
    target = (ADMIN_STATIC_DIR / filename).resolve()
    if not str(target).startswith(str(ADMIN_STATIC_DIR.resolve())) or not target.is_file():
        raise HTTPException(status_code=404, detail="Não encontrado.")
    return FileResponse(path=target)


# ─────────────────────────────────────────────────────────────────────────────
# Auth Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/auth/setup")
async def initial_admin_setup(payload: SetupPayload, request: Request, response: Response):
    """One-time setup ONLY available when zero admin users exist."""
    if store.has_any_admin():
        raise HTTPException(status_code=403, detail="Administrador já configurado.")
    user_id = store.create_admin_user(
        payload.email.strip().lower(), hash_password(payload.password)
    )
    session_info = _issue_session(user_id, request, response, remember=True)
    return {"ok": True, **session_info}


@app.post("/api/auth/login")
async def admin_login(payload: LoginPayload, request: Request, response: Response):
    ip = get_client_ip(request)
    email = payload.email.strip().lower()
    store.enforce_rate_limit(ip)
    user = store.get_admin_by_email(email)

    if not user or not verify_password(payload.password, user["password_hash"]):
        store.log_login_attempt(ip, email, success=False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas.",
        )

    store.log_login_attempt(ip, email, success=True)
    session_info = _issue_session(int(user["id"]), request, response, remember=payload.remember)
    return {"ok": True, "email": user["email"], **session_info}


@app.post("/api/auth/logout")
async def admin_logout(request: Request, response: Response):
    session = _current_session(request)
    if session:
        verify_csrf(request, session)
        store.delete_session(int(session["id"]))
    clear_session_cookie(response)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Protected Admin API
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/admin/bootstrap")
async def admin_bootstrap(session: dict = Depends(require_admin_session)) -> dict[str, Any]:
    sessions, attempts = store.list_sessions_and_attempts(
        int(session["user_id"]), int(session["id"])
    )
    return {
        "admin": {
            "email": session["email"],
            "admin_path": settings.ADMIN_PATH,
            "storage_mode": "supabase" if settings.USE_SUPABASE else "local",
        },
        "profile": store.get_profile(),
        "projects": store.list_projects(only_published=False),
        "experiences": store.list_experiences(only_visible=False),
        "sessions": sessions,
        "login_attempts": attempts,
    }


@app.post("/api/admin/upload/sign")
async def admin_sign_upload(
    payload: SignedUploadPayload,
    _: dict = Depends(require_admin_session),
):
    """Issues a short-lived Supabase Storage Signed Upload URL (bypasses Vercel 4.5 MB limit)."""
    ext = Path(Path(payload.filename).name).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        media_kind = "image"
        max_bytes = settings.MAX_IMAGE_BYTES
    elif ext in VIDEO_EXTENSIONS:
        media_kind = "video"
        max_bytes = settings.MAX_VIDEO_BYTES
    else:
        raise HTTPException(
            status_code=400,
            detail="Formato não suportado. Envie JPG, PNG, WebP, AVIF, GIF, MP4, WebM ou MOV.",
        )

    if payload.size > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo excede o limite de {max_bytes // (1024 * 1024)} MB.",
        )

    if not settings.USE_SUPABASE:
        return {"mode": "direct", "type": media_kind}

    safe_name = f"{secrets.token_hex(16)}{ext}"
    signed = store.sign_supabase_upload(safe_name)
    return {
        "mode": "signed",
        "type": media_kind,
        "filename": safe_name,
        "signed_url": signed["signed_url"],
        "public_url": signed["public_url"],
    }


@app.post("/api/admin/upload")
async def admin_upload_media(
    file: UploadFile = File(...),
    _: dict = Depends(require_admin_session),
):
    if settings.USE_SUPABASE:
        raise HTTPException(
            status_code=400,
            detail="Use o endpoint de upload assinado (/api/admin/upload/sign) no modo nuvem.",
        )
    return await save_validated_upload(file)


# --- Projects CRUD ---

@app.post("/api/admin/projects", status_code=201)
async def create_project(
    payload: ProjectPayload,
    _: dict = Depends(require_admin_session),
):
    record = {
        "display_type": payload.display_type,
        "title_pt": payload.title_pt.strip(),
        "title_en": (payload.title_en or payload.title_pt).strip(),
        "subtitle_pt": payload.subtitle_pt.strip(),
        "subtitle_en": (payload.subtitle_en or payload.subtitle_pt).strip(),
        "description_pt": payload.description_pt.strip(),
        "description_en": (payload.description_en or payload.description_pt).strip(),
        "category": payload.category.strip() or "UI/UX",
        "client": payload.client.strip(),
        "year": payload.year.strip() or "2026",
        "role_pt": payload.role_pt.strip(),
        "role_en": (payload.role_en or payload.role_pt).strip(),
        "deliverables": json.dumps([d.strip() for d in payload.deliverables if d.strip()]),
        "external_url": payload.external_url.strip(),
        "cover_url": payload.cover_url.strip(),
        "video_url": payload.video_url.strip(),
        "media_items": json.dumps([m.model_dump() for m in payload.media_items]),
        "featured": 1 if payload.featured else 0,
        "status": payload.status,
        "sort_order": payload.sort_order,
    }
    return store.create_project_record(record, _slugify(payload.title_pt))


@app.put("/api/admin/projects/{project_id}")
async def update_project(
    project_id: int,
    payload: ProjectPayload,
    _: dict = Depends(require_admin_session),
):
    record = {
        "display_type": payload.display_type,
        "title_pt": payload.title_pt.strip(),
        "title_en": (payload.title_en or payload.title_pt).strip(),
        "subtitle_pt": payload.subtitle_pt.strip(),
        "subtitle_en": (payload.subtitle_en or payload.subtitle_pt).strip(),
        "description_pt": payload.description_pt.strip(),
        "description_en": (payload.description_en or payload.description_pt).strip(),
        "category": payload.category.strip() or "UI/UX",
        "client": payload.client.strip(),
        "year": payload.year.strip() or "2026",
        "role_pt": payload.role_pt.strip(),
        "role_en": (payload.role_en or payload.role_pt).strip(),
        "deliverables": json.dumps([d.strip() for d in payload.deliverables if d.strip()]),
        "external_url": payload.external_url.strip(),
        "cover_url": payload.cover_url.strip(),
        "video_url": payload.video_url.strip(),
        "media_items": json.dumps([m.model_dump() for m in payload.media_items]),
        "featured": 1 if payload.featured else 0,
        "status": payload.status,
        "sort_order": payload.sort_order,
    }
    return store.update_project_record(project_id, record)


@app.delete("/api/admin/projects/{project_id}")
async def delete_project(project_id: int, _: dict = Depends(require_admin_session)):
    store.delete_project_record(project_id)
    return {"ok": True}


@app.post("/api/admin/projects/reorder")
async def reorder_projects(payload: ReorderPayload, _: dict = Depends(require_admin_session)):
    store.reorder_project_records(payload.ids)
    return {"ok": True}


# --- Experiences CRUD ---

@app.post("/api/admin/experiences", status_code=201)
async def create_experience(
    payload: ExperiencePayload,
    _: dict = Depends(require_admin_session),
):
    record = {
        "company": payload.company.strip(),
        "role_pt": payload.role_pt.strip(),
        "role_en": (payload.role_en or payload.role_pt).strip(),
        "period_pt": payload.period_pt.strip(),
        "period_en": (payload.period_en or payload.period_pt).strip(),
        "location_pt": payload.location_pt.strip(),
        "location_en": (payload.location_en or payload.location_pt).strip(),
        "summary_pt": payload.summary_pt.strip(),
        "summary_en": (payload.summary_en or payload.summary_pt).strip(),
        "highlights_pt": json.dumps([h.strip() for h in payload.highlights_pt if h.strip()]),
        "highlights_en": json.dumps(
            [h.strip() for h in (payload.highlights_en or payload.highlights_pt) if h.strip()]
        ),
        "visible": 1 if payload.visible else 0,
        "sort_order": payload.sort_order,
    }
    return store.create_experience_record(record)


@app.put("/api/admin/experiences/{exp_id}")
async def update_experience(
    exp_id: int,
    payload: ExperiencePayload,
    _: dict = Depends(require_admin_session),
):
    record = {
        "company": payload.company.strip(),
        "role_pt": payload.role_pt.strip(),
        "role_en": (payload.role_en or payload.role_pt).strip(),
        "period_pt": payload.period_pt.strip(),
        "period_en": (payload.period_en or payload.period_pt).strip(),
        "location_pt": payload.location_pt.strip(),
        "location_en": (payload.location_en or payload.location_pt).strip(),
        "summary_pt": payload.summary_pt.strip(),
        "summary_en": (payload.summary_en or payload.summary_pt).strip(),
        "highlights_pt": json.dumps([h.strip() for h in payload.highlights_pt if h.strip()]),
        "highlights_en": json.dumps(
            [h.strip() for h in (payload.highlights_en or payload.highlights_pt) if h.strip()]
        ),
        "visible": 1 if payload.visible else 0,
        "sort_order": payload.sort_order,
    }
    return store.update_experience_record(exp_id, record)


@app.delete("/api/admin/experiences/{exp_id}")
async def delete_experience(exp_id: int, _: dict = Depends(require_admin_session)):
    store.delete_experience_record(exp_id)
    return {"ok": True}


# --- Profile Update ---

@app.put("/api/admin/profile")
async def update_profile(
    payload: ProfilePayload,
    _: dict = Depends(require_admin_session),
):
    data = {
        "full_name": payload.full_name.strip(),
        "role_pt": payload.role_pt.strip(),
        "role_en": (payload.role_en or payload.role_pt).strip(),
        "headline_pt": payload.headline_pt.strip(),
        "headline_en": (payload.headline_en or payload.headline_pt).strip(),
        "bio_pt": payload.bio_pt.strip(),
        "bio_en": (payload.bio_en or payload.bio_pt).strip(),
        "years_experience": payload.years_experience,
        "location_pt": payload.location_pt.strip(),
        "location_en": (payload.location_en or payload.location_pt).strip(),
        "availability_pt": payload.availability_pt.strip(),
        "availability_en": (payload.availability_en or payload.availability_pt).strip(),
        "available": 1 if payload.available else 0,
        "email": payload.email.strip(),
        "phone": payload.phone.strip(),
        "whatsapp_url": payload.whatsapp_url.strip(),
        "behance_url": payload.behance_url.strip(),
        "dribbble_url": payload.dribbble_url.strip(),
        "linkedin_url": payload.linkedin_url.strip(),
        "instagram_url": payload.instagram_url.strip(),
        "avatar_url": payload.avatar_url.strip(),
        "hero_image_url": payload.hero_image_url.strip(),
    }
    return store.update_profile_data(data)


# --- Security Management ---

@app.post("/api/admin/security/credentials")
async def update_credentials(
    payload: PasswordChangePayload,
    session: dict = Depends(require_admin_session),
):
    user = store.get_admin_by_id(int(session["user_id"]))
    if not user or not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha atual incorreta.")

    new_email = (payload.new_email or user["email"]).strip().lower()
    new_hash = (
        hash_password(payload.new_password) if payload.new_password else user["password_hash"]
    )
    store.update_admin_user(int(user["id"]), new_email, new_hash)
    store.delete_other_sessions(int(user["id"]), int(session["id"]))
    return {"ok": True, "email": new_email}


@app.post("/api/admin/security/revoke-others")
async def revoke_other_sessions(session: dict = Depends(require_admin_session)):
    store.delete_other_sessions(int(session["user_id"]), int(session["id"]))
    return {"ok": True}
