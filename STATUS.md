# Project Digital — Current Status

> Living progress doc. Read this at the start of every session to know what's
> built, what works, and what to build next. `CLAUDE.md` is the stable project
> definition; this file is the moving target. Update it as things change.

_Last updated: 2026-10-29_

---

## TL;DR for a new chat

**2026-10-30: No Docker. The database is Supabase.** Supabase hosts the
Postgres database, the data API the dashboard uses (the same PostgREST we
ran in Docker) and the login. The API and dashboard run directly on your
machine (`.\scripts\dev.ps1`). Because Supabase's API is on the internet,
the dashboard now has an email + password login, and row-level security
(`db/supabase-rls.sql`) only lets emails in `private.dashboard_users` through.
Setup is in README.md → Getting started. Old data moves across with
`python -m scripts.copy_data`.

**2026-10-29: n8n is gone. Everything runs on a Python (FastAPI) backend
in `backend/`.** Every n8n workflow the dashboard calls was ported
one-for-one (same prompts, models and request/response shapes) into plain Python with
tests. n8n, Appsmith and the `transcript-service` sidecar are gone. The
old workflow JSON is archived in `legacy/n8n/`.
See `backend/README.md` for the layout, endpoints and how gates work.

**What changed in practice:**
- Approval gates are DB rows whose `resume_url` points at the API
  (`/api/approvals/<id>/resume`). There are no paused executions, so jobs
  survive restarts.
- A failed AI step marks the job `failed` with the reason. The job page
  shows it plus a **Retry step** button that keeps earlier approvals.
- No more workflow import, credential reattaching or activating.
  Keys come from `.env`, and http://localhost:8000/health shows which are set.
- Publish to Sanity is now synchronous and returns a real error message.
- yt-dlp runs inside the API, so the separate transcript sidecar is gone.

**Supabase project: `project-digital`** (ref `klobetmoszgubrzzhxdw`,
Singapore, free plan). Created and set up 2026-10-30 via the Supabase
connector:
- all 14 tables from `db/schema.sql`
- row-level security from `db/supabase-rls.sql`, with
  jieshensherwinlee@gmail.com allow-listed
- verified on the live project: anonymous visitors see 0 rows, the
  owner sees everything, other signed-in users see 0 rows
- Supabase's security advisor reports no issues

The URL and publishable key are pre-filled in `.env.example`.

**⚠️ One-time switch-over on your machine (not yet done):**
1. In Supabase: set a database password (Database → Settings →
   Reset database password), turn off new-user sign-ups, and add your login user
   (Authentication → Users → Add user, auto-confirm). Copy `.env.example`
   to `.env`, then fill in `DATABASE_URL` (Connect → Session pooler) and
   the AI keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
   `SANITY_API_TOKEN`; these used to live in n8n credentials). There's no
   need to run `setup_db`, since it's already applied, though re-running
   it is harmless.
2. `docker start projectdigital_postgres`, then
   `python -m scripts.copy_data --from <old db url>`. This copies your jobs
   and images, and re-points any gate still waiting on n8n at the API.
3. `.\scripts\dev.ps1`, sign in, check http://localhost:8000/health, and
   run a test topic end to end.
4. Stop and delete the old containers (n8n, Appsmith, Postgres) in Docker
   Desktop once you're happy.

**⚠️ Ported from the newest exports in the repo.** Stages 1–4 came from
`legacy/n8n/exports/Blog Path - Stages 1 & 2 (Brainstorm + Outline).json`,
which already ran through Stage 4. Anything changed in the n8n UI after
that export was never committed, so it isn't in the port.

**Feature status (all now served by the API):**
- **Blog Stages 1–4** (brainstorm → outline → draft → hero image, each with a gate): were working in n8n; ported.
- **Stage 5 publish to Sanity, Generate meta, Repurpose to social, shortlinks:** dashboard was done; the n8n side had never worked end to end. These now work in the API, untested against the real Sanity.
- **Inspiration** (`/inspiration`), **Guidelines** (`/guidelines`), **Image Checker**, **Image Maker**, **Video Templates**, **Image Gen**: ported.
- All of the above are tested with pytest against a real Postgres, with
  external APIs faked. **None has run against the real APIs since the port.**

**Social scheduling = Metricool (manual on free tier).** **Copy for
Metricool** buttons on every caption tab. API scheduling would need
Metricool paid; the plan is in `legacy/n8n/workflows/schedule-social.README.md`.

### Feature notes worth keeping

- **Image Gen** (`/image-gen`) is the "Contact Sheet to Post" tool from
  `HANDOFF.md`. Brand projects (brief + reference images) → ask → Claude
  Haiku drafts a prompt and checks it against the brief → you edit it →
  Gemini 2.5 Flash Image renders each size (1:1, 4:5, 9:16, 16:9) with the
  references attached → per-image review → exact-size crop on download.
  Migration: `db/migrate-image-gen.sql`.
- **Video Templates:** Gemini watches the YouTube URL directly first.
  Direct-URL access has returned intermittent `403 PERMISSION_DENIED` for
  this project; a key from another Google Cloud project may help. On
  failure it falls back to yt-dlp captions → Claude. Scraping YouTube's
  caption URL without yt-dlp was tried and abandoned (0-byte responses).
- **Guidelines:** PPT isn't supported; export to PDF first. Confirming a
  guideline narrates its summary with OpenAI TTS (`tts-1`).
- **Inspiration:** dashboard upload, **or the Telegram bot (built 2026-10-29)**.
  Share or forward a photo, video or post link to the bot and it's tagged
  and saved, then the bot replies with the category. It polls Telegram,
  so there's no tunnel or public URL. It's off until `TELEGRAM_BOT_TOKEN`
  is set; setup is in `backend/README.md`. Only allow-listed chat ids are
  processed. Tested with a faked Telegram only; first real message pending.

---

## What's running (infrastructure)

`.\scripts\dev.ps1` from this folder (no Docker):

| Piece      | Where                        | Notes                                                       |
|------------|------------------------------|-------------------------------------------------------------|
| Dashboard  | http://localhost:3000        | React + Vite (`npm run dev`); sign in with your Supabase user. Routes: `/`, `/blog`, `/social`, `/images`, `/image-gen`, `/image-maker`, `/image-checker`, `/inspiration`, `/guidelines`, `/video-templates`, `/jobs/:id`. |
| API        | http://localhost:8000        | Python FastAPI (`backend/`, `uvicorn --reload`). Docs at `/docs`; database, key and Telegram check at `/health`; logs in its window. |
| Supabase   | supabase.com (cloud)         | Postgres + data API (PostgREST) + Auth. Free tier: 500 MB database. |

External services (called only by the API):
- **Claude API**: Haiku 4.5 for brainstorm, image prompt, meta, slogans, Image Gen draft; Sonnet 4.6 for outline, draft, captions, PDF/blog guidelines, image check, video fallback.
- **Gemini**: `imagen-4.0-generate-001` (blog hero), `gemini-2.5-flash-image` (Image Maker, Image Gen), `gemini-2.5-flash` (video analysis, inspiration videos).
- **OpenAI**: `tts-1` for guideline narration.
- **Sanity CMS**: project `p9audgmp`, dataset `production`. Public site: https://project-digital-website.vercel.app.
- **TinyURL**: shortlinks (keyless).
- **Metricool** (SaaS): manual copy/paste from the dashboard.

DB schema (`db/schema.sql`):
`content_jobs` (incl. `outline` JSONB, `draft_md` TEXT, `chosen_image_id`,
`blog_url`, `shortlink`), `approval_stages`, `platform_captions` (incl.
`metricool_post_id`), **`images`** (unified library — AI + uploads),
**`generated_images`** (legacy; JobDetail / PendingImages / PublishPanel
still read it. It was never in `schema.sql` until 2026-10-29, when it was
added to match the live table), **`inspiration_items`**, **`guideline_items`**,
**`image_checks`**, **`image_maker_projects`**, **`video_templates`**,
**`brand_projects` / `brand_references` / `image_gen_jobs` / `image_gen_generations`**.

---

## What's DONE

**Phase 1 — Infrastructure** ✅

**Backend switch n8n → Python/FastAPI (2026-10-29)** ✅ (code + tests; real-API smoke test pending)
- `backend/`: `pipeline.py` (Stages 1–4 + gate mechanism), `routers/blog.py`,
  `routers/tools.py`, `routers/image_gen.py`, `prompts.py` (live prompts verbatim).
- 15 pytest tests drive every endpoint against a real Postgres, including
  the full blog path through all five gates, publish, repurpose and retry.
- Dashboard: only URLs changed (`n8nPost` → `apiPost`), plus a Retry
  step button and failure notice on failed jobs.

**Stage 1 — Brainstorm + Approval Gate** ✅
- API: brainstorm → save job → open gate → (approve) → update job.
- UI: `dashboard/src/components/PendingBrainstorms.tsx`.

**Stage 2 — Outline + Approval Gate** ✅
- API: outline → save → open gate → (approve) → advance to `drafting`.
- UI: `PendingOutlines.tsx`.

**Stage 3 — Blog Draft + Approval Gate** ✅
- API: draft → save into `draft_md` → open gate → (approve) → advance to `image`.
- UI: `PendingDrafts.tsx`.

**Stage 4 — Image Prompt + Generation + Approval Gate** ✅
- API: image prompt → Imagen → save → open gate → (approve) → advance to `cms`.
- UI: `PendingImages.tsx`.
- Verified: a job reached `cms` with a saved image and approved Stage-4 row.

**Stage 5 — Publish to Sanity CMS** 🟡 (built end to end; first real publish pending)
- UI: `PublishPanel.tsx` — collapsible card on the job page with **all**
  Sanity post fields (title from H1, slug auto-from-title with Generate
  button, author free-text, category dropdown, reading time from word
  count, excerpt prefilled from outline meta description, cover image
  thumbnail + alt, meta title + description with char counters and
  "falls back to..." hints). All AI-generatable fields have **Generate**
  buttons calling `POST /api/generate-meta`.
- **Pre-publish review modal**: clicking Publish lists any missing
  sections, marks each red (must fix), amber (will be defaulted), or
  gray (Sanity falls back). One click confirms with defaults applied.
- `POST /api/publish-cms` uploads the cover, creates author/category if
  missing, creates the post, and sets `status = published` + `blog_url`.
  It reads `SANITY_API_TOKEN` from `.env`. The n8n version never completed a
  publish (binary-body params, blocked env vars); the API version has only
  run against a faked Sanity so far.

**Repurpose to social** 🟡 (built end to end; untested against real Claude)
- UI: `PendingCaptions.tsx` (tabbed per-platform editor with char bars,
  hashtag pills, **Copy for Metricool** button per tab), `Repurpose to social`
  button on the job page, `ui/PlatformIcon.tsx`. Covers LinkedIn / X /
  **Meta** (relabeled from "Instagram" 2026-06-01 — underlying enum value
  unchanged).
- `POST /api/repurpose-social` writes captions for the chosen platforms in parallel, then opens gate 5.

**Image Library** 🟡 (UI wired; data still in legacy table)
- New unified `images` table + `content_jobs.chosen_image_id` column in
  `db/schema.sql`. Migration at `db/migrate-images.sql` (backfill from
  `generated_images` → `images`, idempotent).
- `pages/ImageLibrary.tsx` + `ui/ImageUploader.tsx` query the new
  `/images` endpoint.
- ⚠️ `JobDetail` + `PendingImages` still read the **legacy** `generated_images`
  embed — that's why the franchises blog still shows its cover image. Full
  migration of those two components to use `chosen_image_id` is open.

**Dashboard polish (2026-05-29 → 2026-06-02)** ✅
- **Real URLs everywhere** via react-router v6: `/`, `/blog`, `/social`,
  `/images`, `/settings`, `/jobs/:id`. Bookmark / refresh / back-button
  all work. `JobNav` context now navigates instead of holding state.
- **Blog Jobs / Social Jobs** pages are real now (filtered job table +
  stats), no longer stubs. Social Jobs page also shows pending caption
  reviews.
- **Per-job page**:
  - Stepper now dynamic, appends a **Social** step when a job has captions.
  - Generated image capped at 520 px, **Download image** button next to it.
  - Read-only **Social posts** tabs once captions are approved.
  - **Repurpose into social posts** card with Repurpose button (hidden
    once captions exist).
- **Pre-publish review modal** with field-by-field defaults (see Stage 5 above).
- **Copy for Metricool** button on social caption tabs (review + read-only).
- Approval toasts; `keepPreviousData` query polling so pages don't flash;
  `ProcessingJobs` indicator; `.docx` / `.md` blog export.

**Backend / docs cleanup**
- Postiz → Metricool swap done across CLAUDE.md, STATUS.md (this file),
  README.md, .env.example, docker-compose.yml, schema.sql, types.ts,
  publish-cms.README.md, repurpose-social.README.md, schedule-social.README.md
  (those READMEs are now in `legacy/n8n/workflows/`).
- DB column renamed via `db/migrate-metricool.sql` (handles both
  `buffer_post_id` and `postiz_post_id` source states).

---

## What's NEXT

**1. Switch-over + smoke test on your machine.** Follow the steps in the
   TL;DR, then run one topic end to end. Fix whatever the real APIs
   disagree with.

**2. Land the first successful Sanity publish.** Use the franchises blog
   (acdada61), from "Ready to publish" to live on
   `project-digital-website.vercel.app/blog`, with `SANITY_API_TOKEN` in `.env`.
   An error now comes back as a message in the publish panel.

**3. Bitly (or keep TinyURL).** Shortlinks use keyless TinyURL. Swapping
   in Bitly is one function (`tinyurl()` in `backend/app/routers/blog.py`)
   plus `BITLY_ACCESS_TOKEN`.

**4. Finish the image-library refactor.** Update `JobDetail`,
   `PendingImages` and `PublishPanel` to read from `images` via
   `chosen_image_id` instead of the legacy `generated_images` embed, and
   have `pipeline._render_hero` write to `images`. Then `generated_images`
   can be retired.

**5. Move images to Supabase Storage.** Images (generated, uploaded,
   references, inspiration previews) are base64 text inside the database.
   The free tier's 500 MB will fill after a few hundred images. Store the
   files in Supabase Storage (1 GB free) and keep only their URLs in the
   tables.

**Phase 3 — native social path.** Topic → social-only flow (no blog).
   Out of scope for now.

**Scheduling via Metricool API**: only if you upgrade to Metricool paid.

---

## Known issues / cleanup

- **Not yet run against real APIs since the port** (see TL;DR).
- **The dashboard login and the Python API haven't talked to the real Supabase yet.** The schema and access rules are applied and verified on the live project. The data API and login have only been tested against a fake Supabase, because the build sandbox can't reach supabase.co.
- `PendingImages` AI badge label says "Gemini Imagen 3"; it's Imagen 4. Cosmetic.
- **Warm-films job stuck at `image`.** It errored before the Imagen-4 fix.
  On the API, set its status to `failed` and click **Retry step**, or delete it.
- `JobDetail` / `PendingImages` / `PublishPanel` still use legacy
  `generated_images` (see NEXT #4).
- **Image Library may be empty after the move.** If the old database never
  ran the generated_images → images backfill, paste
  `legacy/db-migrations/migrate-images.sql` into Supabase → SQL Editor and
  run it (it's idempotent).
- **The old Docker containers and volumes** (n8n, Appsmith, Postgres) are
  unused once the data is copied. Delete them in Docker Desktop.

---

## How to run a topic (the golden path)

1. `.\scripts\dev.ps1` and sign in. After changing `.env`, restart the API
   (Ctrl+C in its window, then run it again).
2. http://localhost:3000 → **Start a topic** → click Start.
3. Watch the **Processing** card, then approve at each gate:
   Brainstorm → Outline → Draft → Image. If a step fails, open the job
   and click **Retry step**.
4. Open the job (`/jobs/<id>`): Stepper, content, Export .docx/.md,
   **Publish to Sanity CMS** panel.
5. In the publish panel, click **Generate** on Excerpt / Alt / Meta title /
   Meta description, review, then **Publish to Sanity**.
6. Click **Repurpose to social** → review captions at Stage 5 → **Copy for
   Metricool** per tab → paste into metricool.com → schedule.

---

## Gotchas already solved (don't relearn these)

Auto-memory at `C:\Users\SHERWIN\.claude\projects\d--ProjectDigital-WORKFLOW\memory\`:

- **PostgREST schema cache:** Supabase reloads it automatically after DDL. (The `postgrest-schema-cache-reload` memory only applied to the Docker setup.)
- **New table → re-run `python -m scripts.setup_db`.** Otherwise row-level security isn't switched on for it, and the dashboard can't read it (or anyone with the anon key can, if RLS is off).
- **Supabase connection: use the Session pooler string.** The "Direct connection" host is IPv6-only on the free tier and fails on most home networks.
- **PowerShell ASCII-only scripts** + no `<` stdin redirection. (`powershell-ascii-only-scripts`)
- **Dashboard = React, not Appsmith.** (`react-dashboard-decision`)
- **Content gen uses the Anthropic API key**, not Claude Code. (`use-anthropic-api-not-headless`)

New gotchas (not yet in auto-memory — worth formalizing):
- **Gemini Imagen model name:** use `imagen-4.0-generate-001` (or `-fast-` / `-ultra-`); `imagen-3.0-generate-002` 404s.
- **The API and dashboard only read `.env` at startup.** Restart them after changing keys.
- **PowerShell `$` in a literal key:** PS expands as a variable and mangles the key. Always use `$key="..."; "...?key=$key"`.
- **Postiz needs Temporal + Elasticsearch in self-host.** Temporal SQL visibility store has a 3-Text-search-attribute limit; ES sidesteps it. RAM + per-platform OAuth setup made it not worth it for MVP — reverted to Metricool 2026-06-01.

Obsolete (kept for history):
- Appsmith era: `appsmith-resume-url-host-swap`, `appsmith-json-body-stringified`.
- n8n era (2026-10-29): `n8n-wait-node-needs-explicit-post`,
  `n8n-queryreplacement-single-equals`, `n8n-workflow-import-method`,
  n8n blocking `$env` in expressions.

---

## Changing backend code

Edit files under `backend/`. The `api` container hot-reloads on save.
Run the tests before committing (see `backend/README.md` → Tests).
