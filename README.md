# Project Digital

Single topic in → platform-ready content out, across a blog and 8 social channels.
**Human-in-the-loop**: every major stage pauses for review before continuing. Not autopilot.

See [`CLAUDE.md`](./CLAUDE.md) for the full workflow, approval gates, and design rationale,
and [`STATUS.md`](./STATUS.md) for what's built and what's next.

---

## Stack

| Layer | Tool | Where |
|---|---|---|
| Backend (AI steps, approval gates, integrations) | Python · FastAPI ([`backend/`](./backend)) | runs on your machine: http://localhost:8000 (docs at `/docs`) |
| Approval dashboard | React + Vite ([`dashboard/`](./dashboard)) | runs on your machine: http://localhost:3000 |
| Database + data API + login | **Supabase** (hosted Postgres; its data API is PostgREST) | supabase.com, free tier |
| Content gen | Claude API | — |
| Image gen | Gemini Imagen 4 / Gemini 2.5 Flash Image | — |
| Narration | OpenAI TTS | — |
| CMS | Sanity | — |
| Shortlinks | TinyURL | — |
| Inspiration capture | Telegram bot (optional) | — |
| Social scheduling | Metricool (SaaS, manual on free tier) | metricool.com |

No Docker. n8n (until 2026-10-29) and the Docker setup are archived in [`legacy/`](./legacy).

---

## Getting started (Windows)

You need **Python 3.12+** (python.org; tick "Add to PATH"), **Node.js 20+** (nodejs.org) and a free **Supabase** account.

### 1. Create the Supabase project

1. supabase.com → **New project**. Pick a region near you and save the database password.
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: Project Settings → Database → Connection string → **Session pooler**, with your password filled in.
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Project Settings → API.
   - Your AI keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SANITY_API_TOKEN`).
3. Supabase → **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
4. Supabase → **Authentication → Users → Add user**: your email + a password, with "Auto Confirm User" ticked.

### 2. Install and create the tables

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m scripts.setup_db --owner-email you@example.com
cd ..\dashboard
npm install
```

`setup_db` creates every table and turns on row-level security, so only
the email(s) you pass can read or write through Supabase's API.

### 3. Run it

```powershell
.\scripts\dev.ps1
```

This opens the API and the dashboard in two windows and launches http://localhost:3000.
Sign in with the user from step 1.4. Check http://localhost:8000/health if anything looks off.

(Mac/Linux: `./scripts/dev.sh`.)

### Moving your existing data (one time)

If you have jobs in the old Docker database, start just that container one
last time (Docker Desktop must be running; the container keeps its name
even though the compose file is gone):

```powershell
docker start projectdigital_postgres
```

then copy everything across:

```powershell
cd backend
python -m scripts.copy_data --from "postgresql://projectdigital:<old POSTGRES_PASSWORD>@localhost:5432/projectdigital"
```

After that, Docker Desktop can be uninstalled.

---

## Repository layout

```
WORKFLOW/
├── CLAUDE.md            project context — read first
├── STATUS.md            living progress doc
├── .env.example         env template (copy to .env)
├── backend/             Python API — every AI step + approval gate (see backend/README.md)
│   └── scripts/         setup_db.py · copy_data.py
├── dashboard/           React approval dashboard
├── db/                  schema.sql · supabase-rls.sql
├── prompts/             prompt templates
├── scripts/             dev.ps1 / dev.sh (start everything) · test-apis.{ps1,sh}
└── legacy/              archived n8n workflows + Docker-era DB migrations
```

---

## Data model

- **`content_jobs`**: one row per topic. Tracks branch (`blog`/`social`), `status`,
  chosen angle, keywords, outline, draft and URLs; misc state is in the `data` jsonb column.
- **`approval_stages`**: one row per gate. The API inserts a `pending` row whose
  `resume_url` points back at the API; the dashboard POSTs the reviewer's input there,
  which closes the gate and runs the next step.
- **`platform_captions`**: per-platform social copy (one row per job × platform).
- Tool tables: `images`, `image_maker_projects`, `image_checks`, `inspiration_items`,
  `guideline_items`, `video_templates`, `brand_projects` / `image_gen_*`.
- **`dashboard_users`**: emails allowed through row-level security.

---

## Approval gates (never auto-advance)

| # | Reviewed | Action |
|---|---|---|
| 1 | Brainstorm / angle | Edit or approve |
| 2 | Blog outline | Edit or approve |
| 3 | Full blog draft | Edit inline or approve |
| 4 | Generated image | Approve / regenerate / upload |
| 5 | Per-platform captions | Edit each platform individually |
| 6 | Final pre-publish | Approve to schedule/publish |

---

## Notes

- **Supabase free tier = 500 MB database.** Images are stored inside the database
  as base64 text, so a few hundred images can fill it. Moving them to Supabase
  Storage is the planned fix (see STATUS.md).
- **`.env` is gitignored.** Only `.env.example` is committed. Never commit real keys,
  and never put the Supabase `service_role` key in a `VITE_` variable.
- **No `caption-youtube.md` yet.** The social path lists YouTube but has no template.
- **Cost target:** ~$15–40/month at solo-founder scale; prefer free tiers.
