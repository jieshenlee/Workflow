# Project Digital

Single topic in → platform-ready content out, across a blog and 8 social channels.
**Human-in-the-loop**: every major stage pauses for review before continuing. Not autopilot.

See [`CLAUDE.md`](./CLAUDE.md) for the full workflow, approval gates, and design rationale,
and [`STATUS.md`](./STATUS.md) for what's built and what's next.

---

## Stack

| Layer | Tool | Local URL |
|---|---|---|
| Backend (AI steps, approval gates, integrations) | Python · FastAPI ([`backend/`](./backend)) | http://localhost:8000 (docs at `/docs`) |
| Approval dashboard | React + Vite ([`dashboard/`](./dashboard)) | http://localhost:3000 |
| Table reads/writes for the dashboard | PostgREST | http://localhost:3001 |
| Database | PostgreSQL 15 | localhost:5432 |
| Content gen | Claude API | — |
| Image gen | Gemini Imagen 4 / Gemini 2.5 Flash Image | — |
| Narration | OpenAI TTS | — |
| CMS | Sanity | — |
| Shortlinks | TinyURL | — |
| Social scheduling | Metricool (SaaS, manual on free tier) | metricool.com |

n8n was the orchestrator until 2026-10-29; its workflows are archived in
[`legacy/n8n/`](./legacy/n8n) for reference.

---

## Getting started

### 1. Configure environment

```powershell
Copy-Item .env.example .env
# then edit .env: API keys + a strong POSTGRES_PASSWORD
```

### 2. Bring up the stack

```powershell
docker compose up -d --build
```

Postgres auto-applies [`db/schema.sql`](./db/schema.sql) on first boot (empty volume only).
Check the API sees your keys: http://localhost:8000/health

### 3. Use it

http://localhost:3000 → **Start a topic** → approve each gate as it appears.

### Without Docker (optional)

Only Postgres + PostgREST need to run in Docker (`docker compose up -d postgres postgrest`):

```powershell
cd backend
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements-dev.txt
$env:ANTHROPIC_API_KEY="..."   # etc. — see backend/README.md
uvicorn app.main:app --reload --port 8000
```

---

## Repository layout

```
WORKFLOW/
├── CLAUDE.md            project context — read first
├── STATUS.md            living progress doc
├── docker-compose.yml   postgres + api + postgrest + dashboard
├── .env.example         env template (copy to .env)
├── backend/             Python API — every AI step + approval gate (see backend/README.md)
├── dashboard/           React approval dashboard
├── db/                  schema.sql + one-off migrations
├── prompts/             prompt templates
├── scripts/             test-apis.{ps1,sh}
└── legacy/n8n/          archived n8n workflows (no longer run)
```

---

## Data model

- **`content_jobs`** — one row per topic. Tracks branch (`blog`/`social`), `status`,
  chosen angle, keywords, outline, draft, URLs; misc state in the `data` jsonb column.
- **`approval_stages`** — one row per gate. The API inserts a `pending` row whose
  `resume_url` points back at the API; the dashboard POSTs the reviewer's input there,
  which closes the gate and runs the next step.
- **`platform_captions`** — per-platform social copy (one row per job × platform).
- Tool tables: `images`, `image_maker_projects`, `image_checks`, `inspiration_items`,
  `guideline_items`, `video_templates`, `brand_projects` / `image_gen_*`.

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

- **No `caption-youtube.md` yet.** The social path lists YouTube but has no template.
- **`.env` is gitignored** — only `.env.example` is committed. Never commit real keys.
- **Cost target:** ~$15–40/month at solo-founder scale; prefer free tiers.
