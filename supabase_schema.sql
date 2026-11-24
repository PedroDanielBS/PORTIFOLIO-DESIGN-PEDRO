-- ============================================================================
-- Pedro Daniel Portfolio — Supabase PostgreSQL Schema + Strict Security (RLS)
-- Cole e execute este script inteiro no Supabase: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Tabelas do Sistema
CREATE TABLE IF NOT EXISTS public.admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    csrf_token TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON public.admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.login_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip TEXT NOT NULL,
    email_attempted TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts(ip, attempted_at);

CREATE TABLE IF NOT EXISTS public.site_profile (
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

CREATE TABLE IF NOT EXISTS public.projects (
    id BIGSERIAL PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS public.experiences (
    id BIGSERIAL PRIMARY KEY,
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

-- 2. Segurança Máxima: Ativar RLS em TODAS as tabelas sem políticas públicas
-- Assim ninguém acessa o banco direto pela internet; apenas o backend na Vercel
-- usando SUPABASE_SERVICE_ROLE_KEY (guardada como segredo no servidor).
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;

-- 3. Bucket de Storage para Imagens e Vídeos (leitura pública, escrita apenas via URL assinada pelo Admin)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('portfolio-media', 'portfolio-media', true, 125829120)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 125829120;

-- Política de leitura pública apenas para exibir as artes/vídeos no portfólio
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read portfolio media'
    ) THEN
        CREATE POLICY "Public read portfolio media"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'portfolio-media');
    END IF;
END $$;

-- 4. Perfil inicial do Pedro Daniel
INSERT INTO public.site_profile (
    id, full_name, role_pt, role_en,
    headline_pt, headline_en,
    bio_pt, bio_en,
    years_experience,
    location_pt, location_en,
    availability_pt, availability_en, available,
    email, phone, whatsapp_url,
    hero_image_url, updated_at
) VALUES (
    1,
    'Pedro Daniel',
    'Designer Gráfico & UI/UX',
    'Graphic & UI/UX Designer',
    'Design gráfico e interfaces com precisão editorial',
    'Graphic design and interfaces built with editorial precision',
    'Sou Pedro Daniel, designer gráfico com 5 anos de atuação no mercado. Construo identidades visuais, sistemas de interface e experiências digitais onde tipografia, proporção e clareza trabalham juntas.',
    'I am Pedro Daniel, a graphic designer with 5 years of industry experience. I craft visual identities, interface systems, and digital products where typography, proportion, and clarity work in concert.',
    5,
    'Brasil · Remoto',
    'Brazil · Remote',
    'Disponível para projetos selecionados',
    'Available for select projects',
    1,
    'Pedrodanielbonfa@gmail.com',
    '(77) 99802-5597',
    'https://wa.me/5577998025597',
    '/static/assets/showcase/hero-glass.jpg',
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
)
ON CONFLICT (id) DO NOTHING;
