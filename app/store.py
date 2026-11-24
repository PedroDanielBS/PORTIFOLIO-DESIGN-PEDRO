"""
Unified Storage & Persistence Layer:
- Local development: SQLite (data/portfolio.db) + local uploads/
- Vercel / Production: Supabase PostgreSQL (via PostgREST with Service Role Key) + Supabase Storage Signed Uploads
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.config import settings
from app.database import get_db, init_db, utc_now_iso
from app.security import (
    RATE_LIMIT_MAX_ATTEMPTS,
    RATE_LIMIT_WINDOW_MINUTES,
    hash_password,
    hash_session_token,
)


def _decode_project(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    raw_deliv = data.get("deliverables")
    data["deliverables"] = json.loads(raw_deliv) if isinstance(raw_deliv, str) else (raw_deliv or [])
    raw_media = data.get("media_items")
    data["media_items"] = json.loads(raw_media) if isinstance(raw_media, str) else (raw_media or [])
    data["featured"] = bool(data.get("featured"))
    return data


def _decode_experience(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for k in ("highlights_pt", "highlights_en"):
        v = data.get(k)
        data[k] = json.loads(v) if isinstance(v, str) else (v or [])
    data["visible"] = bool(data.get("visible"))
    return data


def _decode_profile(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["available"] = bool(data.get("available"))
    data.pop("id", None)
    return data


# ─────────────────────────────────────────────────────────────────────────────
# Minimal zero-dependency Supabase REST & Storage client (works natively on Vercel)
# ─────────────────────────────────────────────────────────────────────────────

class SupabaseClient:
    def __init__(self, url: str, service_key: str, bucket: str):
        self.url = url.rstrip("/")
        self.key = service_key
        self.bucket = bucket

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[dict[str, str]] = None,
        json_body: Any = None,
        prefer: Optional[str] = None,
    ) -> Any:
        full_url = f"{self.url}{path}"
        if params:
            full_url += "?" + urllib.parse.urlencode(params, safe="(),.*")
        headers = {
            "apikey": self.key,
            "Accept": "application/json",
        }
        # Legacy JWT service_role keys require Authorization: Bearer; new sb_secret_ keys use apikey only
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        if prefer:
            headers["Prefer"] = prefer
        data = None
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(full_url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=502,
                detail=f"Erro Supabase ({e.code}): {err_body[:240]}",
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Falha ao conectar ao Supabase: {e}")

    def select(self, table: str, params: Optional[dict[str, str]] = None) -> list[dict[str, Any]]:
        res = self._request("GET", f"/rest/v1/{table}", params=params)
        return res if isinstance(res, list) else []

    def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        res = self._request(
            "POST", f"/rest/v1/{table}", json_body=payload, prefer="return=representation"
        )
        return res[0] if isinstance(res, list) and res else {}

    def update(self, table: str, params: dict[str, str], payload: dict[str, Any]) -> list[dict[str, Any]]:
        res = self._request(
            "PATCH", f"/rest/v1/{table}", params=params, json_body=payload, prefer="return=representation"
        )
        return res if isinstance(res, list) else []

    def delete(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        res = self._request(
            "DELETE", f"/rest/v1/{table}", params=params, prefer="return=representation"
        )
        return res if isinstance(res, list) else []

    def create_signed_upload_url(self, object_path: str) -> dict[str, str]:
        res = self._request(
            "POST",
            f"/storage/v1/object/upload/sign/{self.bucket}/{object_path}",
            json_body={},
        )
        # Supabase returns {"url": "/object/upload/sign/bucket/path?token=...", "token": "..."}
        rel = res.get("url", "") if isinstance(res, dict) else ""
        if rel.startswith("http"):
            signed_url = rel
        elif rel.startswith("/storage/v1"):
            signed_url = f"{self.url}{rel}"
        else:
            signed_url = f"{self.url}/storage/v1{rel}"
        public_url = f"{self.url}/storage/v1/object/public/{self.bucket}/{object_path}"
        return {"signed_url": signed_url, "public_url": public_url}


def _sb() -> SupabaseClient:
    return SupabaseClient(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
        settings.SUPABASE_BUCKET,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public Store API (automatically routes to Supabase or SQLite)
# ─────────────────────────────────────────────────────────────────────────────

def init_storage() -> None:
    if not settings.USE_SUPABASE:
        init_db()
        return
    # In Supabase mode, bootstrap initial admin if ADMIN_PASSWORD env var is set and table is empty
    if settings.ADMIN_PASSWORD:
        sb = _sb()
        existing = sb.select("admin_users", {"select": "id", "limit": "1"})
        if not existing:
            now = utc_now_iso()
            sb.insert(
                "admin_users",
                {
                    "email": settings.ADMIN_EMAIL,
                    "password_hash": hash_password(settings.ADMIN_PASSWORD),
                    "created_at": now,
                    "updated_at": now,
                },
            )


def has_any_admin() -> bool:
    if settings.USE_SUPABASE:
        return bool(_sb().select("admin_users", {"select": "id", "limit": "1"}))
    with get_db() as conn:
        return conn.execute("SELECT id FROM admin_users LIMIT 1").fetchone() is not None


def get_admin_by_email(email: str) -> Optional[dict[str, Any]]:
    if settings.USE_SUPABASE:
        rows = _sb().select("admin_users", {"select": "*", "email": f"eq.{email}", "limit": "1"})
        return rows[0] if rows else None
    with get_db() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None


def get_admin_by_id(user_id: int) -> Optional[dict[str, Any]]:
    if settings.USE_SUPABASE:
        rows = _sb().select("admin_users", {"select": "*", "id": f"eq.{user_id}", "limit": "1"})
        return rows[0] if rows else None
    with get_db() as conn:
        row = conn.execute("SELECT * FROM admin_users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


def create_admin_user(email: str, password_hash: str) -> int:
    now = utc_now_iso()
    if settings.USE_SUPABASE:
        row = _sb().insert(
            "admin_users",
            {"email": email, "password_hash": password_hash, "created_at": now, "updated_at": now},
        )
        return int(row["id"])
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO admin_users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (email, password_hash, now, now),
        )
        return int(cur.lastrowid)


def update_admin_user(user_id: int, email: str, password_hash: str) -> None:
    now = utc_now_iso()
    if settings.USE_SUPABASE:
        _sb().update(
            "admin_users",
            {"id": f"eq.{user_id}"},
            {"email": email, "password_hash": password_hash, "updated_at": now},
        )
        return
    with get_db() as conn:
        conn.execute(
            "UPDATE admin_users SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?",
            (email, password_hash, now, user_id),
        )


# --- Rate Limiting ---

def enforce_rate_limit(ip: str) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)).isoformat()
    if settings.USE_SUPABASE:
        rows = _sb().select(
            "login_attempts",
            {
                "select": "id",
                "ip": f"eq.{ip}",
                "success": "eq.0",
                "attempted_at": f"gte.{cutoff}",
            },
        )
        fail_count = len(rows)
    else:
        with get_db() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at >= ?",
                (ip, cutoff),
            ).fetchone()
            fail_count = int(row["c"]) if row else 0

    if fail_count >= RATE_LIMIT_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_MINUTES * 60)},
        )


def log_login_attempt(ip: str, email: str, success: bool) -> None:
    now = utc_now_iso()
    if settings.USE_SUPABASE:
        _sb().insert(
            "login_attempts",
            {
                "ip": ip[:64],
                "email_attempted": email[:120],
                "success": 1 if success else 0,
                "attempted_at": now,
            },
        )
        return
    with get_db() as conn:
        conn.execute(
            "INSERT INTO login_attempts (ip, email_attempted, success, attempted_at) VALUES (?, ?, ?, ?)",
            (ip[:64], email[:120], 1 if success else 0, now),
        )


# --- Sessions ---

def save_session(
    token_hash: str,
    csrf_token: str,
    user_id: int,
    ip: str,
    user_agent: str,
    expires_at: str,
    created_at: str,
) -> None:
    if settings.USE_SUPABASE:
        _sb().insert(
            "admin_sessions",
            {
                "token_hash": token_hash,
                "csrf_token": csrf_token,
                "user_id": user_id,
                "ip": ip,
                "user_agent": user_agent,
                "expires_at": expires_at,
                "created_at": created_at,
            },
        )
        return
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO admin_sessions (
                token_hash, csrf_token, user_id, ip, user_agent, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (token_hash, csrf_token, user_id, ip, user_agent, expires_at, created_at),
        )


def find_valid_session(raw_token: Optional[str]) -> Optional[dict[str, Any]]:
    if not raw_token or len(raw_token) < 20:
        return None
    token_hash = hash_session_token(raw_token)
    now_iso = utc_now_iso()

    if settings.USE_SUPABASE:
        sb = _sb()
        rows = sb.select(
            "admin_sessions",
            {
                "select": "*",
                "token_hash": f"eq.{token_hash}",
                "expires_at": f"gt.{now_iso}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        sess = rows[0]
        user = get_admin_by_id(int(sess["user_id"]))
        if not user:
            return None
        sess["email"] = user["email"]
        return sess

    with get_db() as conn:
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
        return dict(row) if row else None


def delete_session(session_id: int) -> None:
    if settings.USE_SUPABASE:
        _sb().delete("admin_sessions", {"id": f"eq.{session_id}"})
        return
    with get_db() as conn:
        conn.execute("DELETE FROM admin_sessions WHERE id = ?", (session_id,))


def delete_other_sessions(user_id: int, current_session_id: int) -> None:
    if settings.USE_SUPABASE:
        _sb().delete(
            "admin_sessions",
            {"user_id": f"eq.{user_id}", "id": f"neq.{current_session_id}"},
        )
        return
    with get_db() as conn:
        conn.execute(
            "DELETE FROM admin_sessions WHERE user_id = ? AND id != ?",
            (user_id, current_session_id),
        )


def list_sessions_and_attempts(user_id: int, current_session_id: int) -> tuple[list[dict], list[dict]]:
    if settings.USE_SUPABASE:
        sb = _sb()
        sessions = sb.select(
            "admin_sessions",
            {
                "select": "id,ip,user_agent,created_at,expires_at",
                "user_id": f"eq.{user_id}",
                "order": "created_at.desc",
            },
        )
        for s in sessions:
            s["is_current"] = 1 if int(s["id"]) == int(current_session_id) else 0
        attempts = sb.select(
            "login_attempts",
            {
                "select": "ip,email_attempted,success,attempted_at",
                "order": "id.desc",
                "limit": "15",
            },
        )
        return sessions, attempts

    with get_db() as conn:
        sessions = conn.execute(
            """
            SELECT id, ip, user_agent, created_at, expires_at,
                   CASE WHEN id = ? THEN 1 ELSE 0 END AS is_current
            FROM admin_sessions
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (current_session_id, user_id),
        ).fetchall()
        attempts = conn.execute(
            "SELECT ip, email_attempted, success, attempted_at FROM login_attempts ORDER BY id DESC LIMIT 15"
        ).fetchall()
        return [dict(s) for s in sessions], [dict(a) for a in attempts]


# --- Portfolio Content (Profile, Projects, Experiences) ---

def get_profile() -> dict[str, Any]:
    if settings.USE_SUPABASE:
        rows = _sb().select("site_profile", {"select": "*", "id": "eq.1", "limit": "1"})
        return _decode_profile(rows[0]) if rows else {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM site_profile WHERE id = 1").fetchone()
        return _decode_profile(dict(row)) if row else {}


def update_profile_data(data: dict[str, Any]) -> dict[str, Any]:
    data["updated_at"] = utc_now_iso()
    if settings.USE_SUPABASE:
        rows = _sb().update("site_profile", {"id": "eq.1"}, data)
        return _decode_profile(rows[0]) if rows else get_profile()
    with get_db() as conn:
        cols = ", ".join(f"{k} = ?" for k in data.keys())
        conn.execute(f"UPDATE site_profile SET {cols} WHERE id = 1", list(data.values()))
        row = conn.execute("SELECT * FROM site_profile WHERE id = 1").fetchone()
        return _decode_profile(dict(row))


def list_projects(only_published: bool = False) -> list[dict[str, Any]]:
    if settings.USE_SUPABASE:
        params: dict[str, str] = {"select": "*", "order": "sort_order.asc,id.desc"}
        if only_published:
            params["status"] = "eq.published"
        rows = _sb().select("projects", params)
        return [_decode_project(r) for r in rows]

    with get_db() as conn:
        sql = "SELECT * FROM projects"
        if only_published:
            sql += " WHERE status = 'published'"
        sql += " ORDER BY sort_order ASC, id DESC"
        rows = conn.execute(sql).fetchall()
        return [_decode_project(dict(r)) for r in rows]


def create_project_record(record: dict[str, Any], base_slug: str) -> dict[str, Any]:
    now = utc_now_iso()
    if settings.USE_SUPABASE:
        sb = _sb()
        existing = sb.select("projects", {"select": "slug,sort_order"})
        existing_slugs = {r["slug"] for r in existing}
        slug = base_slug
        suffix = 1
        while slug in existing_slugs:
            suffix += 1
            slug = f"{base_slug}-{suffix}"
        max_order = max((int(r.get("sort_order") or 0) for r in existing), default=0)
        record["slug"] = slug
        record["sort_order"] = record["sort_order"] if record.get("sort_order", 0) > 0 else max_order + 1
        record["created_at"] = now
        record["updated_at"] = now
        row = sb.insert("projects", record)
        return _decode_project(row)

    with get_db() as conn:
        slug = base_slug
        suffix = 1
        while conn.execute("SELECT id FROM projects WHERE slug = ?", (slug,)).fetchone():
            suffix += 1
            slug = f"{base_slug}-{suffix}"
        max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM projects").fetchone()[0]
        record["slug"] = slug
        record["sort_order"] = record["sort_order"] if record.get("sort_order", 0) > 0 else max_order + 1
        record["created_at"] = now
        record["updated_at"] = now
        cols = ", ".join(record.keys())
        qs = ", ".join("?" for _ in record)
        cur = conn.execute(f"INSERT INTO projects ({cols}) VALUES ({qs})", list(record.values()))
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _decode_project(dict(row))


def update_project_record(project_id: int, record: dict[str, Any]) -> dict[str, Any]:
    record["updated_at"] = utc_now_iso()
    if settings.USE_SUPABASE:
        rows = _sb().update("projects", {"id": f"eq.{project_id}"}, record)
        if not rows:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        return _decode_project(rows[0])

    with get_db() as conn:
        if not conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        cols = ", ".join(f"{k} = ?" for k in record.keys())
        conn.execute(f"UPDATE projects SET {cols} WHERE id = ?", [*record.values(), project_id])
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return _decode_project(dict(row))


def delete_project_record(project_id: int) -> None:
    if settings.USE_SUPABASE:
        rows = _sb().delete("projects", {"id": f"eq.{project_id}"})
        if not rows:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        return
    with get_db() as conn:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Projeto não encontrado.")


def reorder_project_records(ids: list[int]) -> None:
    if settings.USE_SUPABASE:
        sb = _sb()
        for idx, pid in enumerate(ids, start=1):
            sb.update("projects", {"id": f"eq.{pid}"}, {"sort_order": idx})
        return
    with get_db() as conn:
        for idx, pid in enumerate(ids, start=1):
            conn.execute("UPDATE projects SET sort_order = ? WHERE id = ?", (idx, pid))


def list_experiences(only_visible: bool = False) -> list[dict[str, Any]]:
    if settings.USE_SUPABASE:
        params: dict[str, str] = {"select": "*", "order": "sort_order.asc,id.desc"}
        if only_visible:
            params["visible"] = "eq.1"
        rows = _sb().select("experiences", params)
        return [_decode_experience(r) for r in rows]

    with get_db() as conn:
        sql = "SELECT * FROM experiences"
        if only_visible:
            sql += " WHERE visible = 1"
        sql += " ORDER BY sort_order ASC, id DESC"
        rows = conn.execute(sql).fetchall()
        return [_decode_experience(dict(r)) for r in rows]


def create_experience_record(record: dict[str, Any]) -> dict[str, Any]:
    now = utc_now_iso()
    if settings.USE_SUPABASE:
        sb = _sb()
        existing = sb.select("experiences", {"select": "sort_order"})
        max_order = max((int(r.get("sort_order") or 0) for r in existing), default=0)
        record["sort_order"] = record["sort_order"] if record.get("sort_order", 0) > 0 else max_order + 1
        record["created_at"] = now
        record["updated_at"] = now
        row = sb.insert("experiences", record)
        return _decode_experience(row)

    with get_db() as conn:
        max_order = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM experiences").fetchone()[0]
        record["sort_order"] = record["sort_order"] if record.get("sort_order", 0) > 0 else max_order + 1
        record["created_at"] = now
        record["updated_at"] = now
        cols = ", ".join(record.keys())
        qs = ", ".join("?" for _ in record)
        cur = conn.execute(f"INSERT INTO experiences ({cols}) VALUES ({qs})", list(record.values()))
        row = conn.execute("SELECT * FROM experiences WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _decode_experience(dict(row))


def update_experience_record(exp_id: int, record: dict[str, Any]) -> dict[str, Any]:
    record["updated_at"] = utc_now_iso()
    if settings.USE_SUPABASE:
        rows = _sb().update("experiences", {"id": f"eq.{exp_id}"}, record)
        if not rows:
            raise HTTPException(status_code=404, detail="Experiência não encontrada.")
        return _decode_experience(rows[0])

    with get_db() as conn:
        if not conn.execute("SELECT id FROM experiences WHERE id = ?", (exp_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Experiência não encontrada.")
        cols = ", ".join(f"{k} = ?" for k in record.keys())
        conn.execute(f"UPDATE experiences SET {cols} WHERE id = ?", [*record.values(), exp_id])
        row = conn.execute("SELECT * FROM experiences WHERE id = ?", (exp_id,)).fetchone()
        return _decode_experience(dict(row))


def delete_experience_record(exp_id: int) -> None:
    if settings.USE_SUPABASE:
        rows = _sb().delete("experiences", {"id": f"eq.{exp_id}"})
        if not rows:
            raise HTTPException(status_code=404, detail="Experiência não encontrada.")
        return
    with get_db() as conn:
        cur = conn.execute("DELETE FROM experiences WHERE id = ?", (exp_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Experiência não encontrada.")


def sign_supabase_upload(safe_filename: str) -> dict[str, str]:
    return _sb().create_signed_upload_url(safe_filename)
