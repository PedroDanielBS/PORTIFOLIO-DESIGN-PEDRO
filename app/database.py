from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from app.config import DATA_DIR, DB_PATH, UPLOADS_DIR, settings
from app.security import hash_password


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS admin_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT UNIQUE NOT NULL,
                csrf_token TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                ip TEXT NOT NULL,
                user_agent TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token ON admin_sessions(token_hash);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL,
                email_attempted TEXT NOT NULL,
                success INTEGER NOT NULL DEFAULT 0,
                attempted_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
                ON login_attempts(ip, attempted_at);

            CREATE TABLE IF NOT EXISTS site_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                full_name TEXT NOT NULL,
                role_pt TEXT NOT NULL,
                role_en TEXT NOT NULL,
                headline_pt TEXT NOT NULL,
                headline_en TEXT NOT NULL,
                bio_pt TEXT NOT NULL,
                bio_en TEXT NOT NULL,
                years_experience INTEGER NOT NULL DEFAULT 5,
                location_pt TEXT NOT NULL,
                location_en TEXT NOT NULL,
                availability_pt TEXT NOT NULL,
                availability_en TEXT NOT NULL,
                available INTEGER NOT NULL DEFAULT 1,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                whatsapp_url TEXT NOT NULL,
                behance_url TEXT NOT NULL DEFAULT '',
                dribbble_url TEXT NOT NULL DEFAULT '',
                linkedin_url TEXT NOT NULL DEFAULT '',
                instagram_url TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                hero_image_url TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                display_type TEXT NOT NULL CHECK (display_type IN ('card', 'carousel', 'video')),
                title_pt TEXT NOT NULL,
                title_en TEXT NOT NULL,
                subtitle_pt TEXT NOT NULL DEFAULT '',
                subtitle_en TEXT NOT NULL DEFAULT '',
                description_pt TEXT NOT NULL DEFAULT '',
                description_en TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'UI/UX',
                client TEXT NOT NULL DEFAULT '',
                year TEXT NOT NULL DEFAULT '2026',
                role_pt TEXT NOT NULL DEFAULT '',
                role_en TEXT NOT NULL DEFAULT '',
                deliverables TEXT NOT NULL DEFAULT '[]',
                external_url TEXT NOT NULL DEFAULT '',
                cover_url TEXT NOT NULL DEFAULT '',
                video_url TEXT NOT NULL DEFAULT '',
                media_items TEXT NOT NULL DEFAULT '[]',
                featured INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS experiences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                role_pt TEXT NOT NULL,
                role_en TEXT NOT NULL,
                period_pt TEXT NOT NULL,
                period_en TEXT NOT NULL,
                location_pt TEXT NOT NULL DEFAULT '',
                location_en TEXT NOT NULL DEFAULT '',
                summary_pt TEXT NOT NULL DEFAULT '',
                summary_en TEXT NOT NULL DEFAULT '',
                highlights_pt TEXT NOT NULL DEFAULT '[]',
                highlights_en TEXT NOT NULL DEFAULT '[]',
                visible INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )

        now = utc_now_iso()

        # Bootstrap initial admin user if table is empty and ADMIN_PASSWORD is configured
        existing_admin = conn.execute("SELECT id FROM admin_users LIMIT 1").fetchone()
        if not existing_admin and settings.ADMIN_PASSWORD:
            conn.execute(
                """
                INSERT INTO admin_users (email, password_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (settings.ADMIN_EMAIL, hash_password(settings.ADMIN_PASSWORD), now, now),
            )

        # Bootstrap Pedro Daniel's profile if not yet created
        existing_profile = conn.execute("SELECT id FROM site_profile WHERE id = 1").fetchone()
        if not existing_profile:
            conn.execute(
                """
                INSERT INTO site_profile (
                    id, full_name, role_pt, role_en,
                    headline_pt, headline_en,
                    bio_pt, bio_en,
                    years_experience,
                    location_pt, location_en,
                    availability_pt, availability_en, available,
                    email, phone, whatsapp_url,
                    behance_url, dribbble_url, linkedin_url, instagram_url,
                    avatar_url, hero_image_url, updated_at
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "Pedro Daniel",
                    "Designer Gráfico & UI/UX",
                    "Graphic & UI/UX Designer",
                    "Design gráfico e interfaces com precisão editorial",
                    "Graphic design and interfaces built with editorial precision",
                    (
                        "Sou Pedro Daniel, designer gráfico com 5 anos de atuação no mercado. "
                        "Construo identidades visuais, sistemas de interface e experiências digitais "
                        "onde tipografia, proporção e clareza trabalham juntas."
                    ),
                    (
                        "I am Pedro Daniel, a graphic designer with 5 years of industry experience. "
                        "I craft visual identities, interface systems, and digital products "
                        "where typography, proportion, and clarity work in concert."
                    ),
                    5,
                    "Brasil · Remoto",
                    "Brazil · Remote",
                    "Disponível para projetos selecionados",
                    "Available for select projects",
                    1,
                    "Pedrodanielbonfa@gmail.com",
                    "(77) 99802-5597",
                    "https://wa.me/5577998025597",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "/static/assets/showcase/hero-glass.jpg",
                    now,
                ),
            )

        # Seed 3 refined showcase projects (Card, Carousel, Video) if database has none yet.
        # Pedro can edit or remove these anytime from the Admin Panel.
        existing_projects = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()["c"]
        if existing_projects == 0:
            seed_projects = [
                (
                    "aurelia-banking-system",
                    "card",
                    "Aurelia Design System",
                    "Aurelia Design System",
                    "Arquitetura de interface e produto financeiro em modo escuro",
                    "Dark-mode financial product architecture and interface system",
                    (
                        "Redesign completo da experiência de conta digital e biblioteca de componentes. "
                        "Foco em hierarquia tipográfica tabular, redução de ruído cognitivo e fluidez entre "
                        "desktop e mobile."
                    ),
                    (
                        "Complete redesign of a digital banking experience and multi-platform component library. "
                        "Focused on tabular typographic hierarchy, reduced cognitive friction, and desktop-to-mobile continuity."
                    ),
                    "UI/UX",
                    "Aurelia FinTech",
                    "2026",
                    "Product & UI/UX Designer",
                    "Product & UI/UX Designer",
                    json.dumps(["Design System", "UI/UX", "Protótipo Interativo", "Direção Visual"]),
                    "",
                    "/static/assets/showcase/work-fintech-ui.jpg",
                    "",
                    json.dumps([
                        {
                            "url": "/static/assets/showcase/work-fintech-ui.jpg",
                            "type": "image",
                            "caption_pt": "Sistema de componentes e painel principal em grade suíça",
                            "caption_en": "Component system and primary dashboard on a Swiss grid",
                        }
                    ]),
                    1,
                    "published",
                    1,
                    now,
                    now,
                ),
                (
                    "monolith-editorial-identity",
                    "carousel",
                    "Monolith Identidade & Editorial",
                    "Monolith Identity & Editorial",
                    "Sistema gráfico, papelaria tátil e direção de arte para estúdio",
                    "Graphic system, tactile print stationery, and studio art direction",
                    (
                        "Projeto multidisciplinar integrando identidade visual impressa, grid editorial e "
                        "aplicações digitais. Navegue pelo carrossel para inspecionar os desdobramentos "
                        "entre papelaria, interface e linguagem visual."
                    ),
                    (
                        "Multidisciplinary identity bridging embossed print stationery, editorial grids, and "
                        "digital surfaces. Swipe through the carousel to inspect stationery, UI, and visual language extensions."
                    ),
                    "Graphic Design",
                    "Monolith Studio",
                    "2025",
                    "Designer Gráfico & Diretor de Arte",
                    "Graphic Designer & Art Director",
                    json.dumps(["Identidade Visual", "Editorial", "Papelaria", "Brand Guidelines"]),
                    "",
                    "/static/assets/showcase/work-editorial-brand.jpg",
                    "",
                    json.dumps([
                        {
                            "url": "/static/assets/showcase/work-editorial-brand.jpg",
                            "type": "image",
                            "caption_pt": "01 — Papelaria em baixo-relevo e sistema tipográfico impresso",
                            "caption_en": "01 — Embossed stationery and printed typographic system",
                        },
                        {
                            "url": "/static/assets/showcase/work-fintech-ui.jpg",
                            "type": "image",
                            "caption_pt": "02 — Desdobramento digital e guia de interface",
                            "caption_en": "02 — Digital translation and interface guidelines",
                        },
                        {
                            "url": "/static/assets/showcase/work-motion-reel.jpg",
                            "type": "image",
                            "caption_pt": "03 — Linguagem tridimensional e materiais ópticos",
                            "caption_en": "03 — Dimensional language and optical materials",
                        },
                    ]),
                    1,
                    "published",
                    2,
                    now,
                    now,
                ),
                (
                    "kinetix-optical-showreel",
                    "video",
                    "Kinetix Motion & Optical Reel",
                    "Kinetix Motion & Optical Reel",
                    "Estudo de movimento, superfícies refrativas e micro-interações",
                    "Motion study, refractive glass surfaces, and product micro-interactions",
                    (
                        "Compilação de direção de movimento e estudos visuais para lançamentos digitais. "
                        "Pelo painel administrativo você pode substituir por vídeos MP4/WebM próprios "
                        "ou links do YouTube e Vimeo."
                    ),
                    (
                        "Compilation of motion direction and visual studies for digital product launches. "
                        "In the admin panel you can upload native MP4/WebM reels or embed YouTube and Vimeo links."
                    ),
                    "Motion & Video",
                    "Estudo Autoral",
                    "2026",
                    "Direção Visual & Motion",
                    "Visual Direction & Motion",
                    json.dumps(["Motion Design", "Showreel", "Micro-interações", "Direção de Arte"]),
                    "",
                    "/static/assets/showcase/work-motion-reel.jpg",
                    "demo://optical-reel",
                    json.dumps([
                        {
                            "url": "/static/assets/showcase/work-motion-reel.jpg",
                            "type": "image",
                            "caption_pt": "Frame principal do estudo óptico em titânio e vidro",
                            "caption_en": "Key frame from the titanium and glass optical study",
                        }
                    ]),
                    1,
                    "published",
                    3,
                    now,
                    now,
                ),
            ]
            conn.executemany(
                """
                INSERT INTO projects (
                    slug, display_type, title_pt, title_en, subtitle_pt, subtitle_en,
                    description_pt, description_en, category, client, year,
                    role_pt, role_en, deliverables, external_url, cover_url, video_url,
                    media_items, featured, status, sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_projects,
            )
