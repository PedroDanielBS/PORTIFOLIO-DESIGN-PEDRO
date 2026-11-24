# Portfólio — Pedro Daniel (Designer Gráfico & UI/UX)

Portfólio Dark Editorial com efeito **Liquid Glass**, suporte **bilíngue (PT / EN)**, grade de **3 colunas para posts do Instagram (4:5)**, suporte a **vídeos verticais 1080×1920 com controle de volume** e **Painel Administrativo privado**.

- **Local:** FastAPI + SQLite + uploads locais
- **Produção (Vercel):** FastAPI Serverless (`api/index.py`) + **Supabase PostgreSQL** + **Supabase Storage** (upload direto assinado, sem bater no limite de 4,5 MB da Vercel — aceita vídeos 1080×1920 de até 120 MB)

---

## Como publicar grátis na Vercel + Supabase

### Passo 1 — Criar o banco e storage no Supabase (grátis)
1. Acesse https://supabase.com e crie um projeto gratuito.
2. No menu lateral do Supabase, clique em **SQL Editor** → **New query**.
3. Copie TODO o conteúdo do arquivo `supabase_schema.sql` deste repositório, cole lá e clique em **Run**.
   - Isso cria todas as tabelas com **RLS (Row Level Security)** bloqueando acessos externos e cria o bucket `portfolio-media` para imagens e vídeos.
4. No Supabase, vá em **Project Settings → API** e copie:
   - **Project URL** (`SUPABASE_URL`)
   - **service_role secret** (`SUPABASE_SERVICE_ROLE_KEY`) *(mantenha em segredo, nunca coloque no frontend!)*

### Passo 2 — Subir o código no GitHub
```powershell
git add .
git commit -m "Portfolio Liquid Glass + Painel Admin pronto para Vercel e Supabase"
git push origin main
```
*(O `.gitignore` garante que `.env`, `.venv/`, `data/` e `uploads/` nunca sejam enviados ao GitHub.)*

### Passo 3 — Deploy na Vercel (grátis)
1. Acesse https://vercel.com → **Add New → Project** → importe o repositório `PORTIFOLIO-DESIGN-PEDRO`.
2. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `SUPABASE_URL` = *(URL copiada do Supabase)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(chave `service_role` copiada do Supabase)*
   - `SUPABASE_BUCKET` = `portfolio-media`
   - `ADMIN_PATH` = `/studio-admin` *(ou outra rota secreta que preferir, ex.: `/painel-pedro-99`)*
   - `SESSION_SECRET` = *(qualquer string longa aleatória de 64 caracteres)*
   - `COOKIE_SECURE` = `true`
3. Clique em **Deploy**.

### Passo 4 — Primeiro acesso online
1. Abra `https://seu-site.vercel.app/studio-admin` (ou o `ADMIN_PATH` escolhido).
2. Crie sua senha forte (mínimo 10 caracteres) — após criar, a tela de configuração é bloqueada permanentemente.
3. Cadastre seus trabalhos (Cards, Carrosséis, Vídeos 1080×1920) e suas experiências profissionais!

---

## Como rodar localmente

```powershell
.\.venv\Scripts\python.exe run.py
```

- **Site público:** http://127.0.0.1:8000
- **Painel Admin:** http://127.0.0.1:8000/studio-admin
