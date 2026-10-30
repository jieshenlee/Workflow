# Project Digital API (`backend/`)

Python (FastAPI) backend that replaced the n8n workflows on 2026-10-29.
Every AI call, approval gate and external integration lives here as
plain Python, in git, with tests.

- **Run:** `.\scripts\dev.ps1` from the repo root, or by hand:
  `cd backend; .venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000`
- **Interactive docs:** http://localhost:8000/docs (try any endpoint from the browser)
- **Health (database, which keys are set, Telegram):** http://localhost:8000/health
- **Logs:** printed in the API's window

The database is Supabase. The dashboard reads and writes plain table data
straight through Supabase's data API, signed in as you. The API connects
to the same database directly (`DATABASE_URL`) and handles anything that
calls a model or an outside service. It listens only on localhost.

## Layout

```
app/
  main.py          FastAPI app, CORS, /health
  config.py        settings from environment variables
  db.py            psycopg connection pool + helpers
  ai.py            Claude / Gemini / Imagen / OpenAI TTS over raw HTTP
  prompts.py       live system prompts (copied verbatim from the n8n workflows)
  pipeline.py      blog Stages 1-4 + the approval-gate mechanism
  routers/
    blog.py        start/upload blog, approvals, retry, meta, publish, repurpose, shorten
    tools.py       image maker, image checker, inspiration, guidelines, video templates
    image_gen.py   Image Gen draft + render
  telegram.py      Telegram inspiration bot (background poller)
tests/             pytest against a real Postgres; all external APIs faked
scripts/
  setup_db.py      create tables + row-level security in Supabase
  copy_data.py     one-time copy from the old Docker Postgres
```

## Endpoints

Request and response shapes match the old n8n webhooks one-for-one, so the
dashboard only changed URLs.

| Endpoint | Was (n8n) | Notes |
|---|---|---|
| `POST /api/start-blog` | `start-blog` | Creates the job immediately, brainstorms in the background |
| `POST /api/upload-blog` | `upload-blog` | .docx path; starts at the image stage |
| `POST /api/approvals/{id}/resume` | Wait-node resume URLs | Stored as each gate's `resume_url`. Approving twice → 409 |
| `POST /api/jobs/{id}/retry` | — (new) | Re-runs the step a failed job died in; earlier approvals kept |
| `POST /api/generate-meta` | `generate-meta` | |
| `POST /api/publish-cms` | `publish-cms` | Now synchronous: returns `{ok, blog_url}` or a real error |
| `POST /api/repurpose-social` | `repurpose-social` | Captions written in parallel, then gate 5 |
| `GET /api/shorten?url=` | `shorten` | |
| `POST /api/image-maker` | `image-maker` | |
| `POST /api/image-check` | `image-check` | |
| `POST /api/inspiration-upload` | `inspiration-upload` | |
| `POST /api/guideline-upload` / `guideline-confirm` | same | |
| `POST /api/video-template-extract` | `video-template-extract` | yt-dlp now runs in-process, so the `transcript-service` sidecar is gone |
| `POST /api/image-gen/draft` / `render` | `image-gen-draft` / `-render` | Sizes render in parallel |

## Telegram inspiration bot

Share or forward a photo, a video, or a post link (TikTok, X, YouTube…)
to your bot. The API downloads it, tags it the same way as a dashboard
upload, saves it to `/inspiration` (marked **Telegram**), and replies
with the category and summary. It uses long polling, so it needs **no
public URL or tunnel**; it runs as a background thread in the API.

Setup (about 3 minutes):
1. In Telegram, message **@BotFather** → `/newbot` → pick a name → copy the token.
2. In `.env`, set `TELEGRAM_BOT_TOKEN=<token>`, then restart the API (Ctrl+C in its window, run it again).
3. Message your bot anything. It replies "This bot is private… add <your id> to TELEGRAM_ALLOWED_CHAT_IDS".
4. Set `TELEGRAM_ALLOWED_CHAT_IDS=<that id>` in `.env` and restart the API again. Done.

Only allow-listed chats are processed, so strangers who find the bot
can't spend your AI credits. `/health` shows whether it's polling and the
last error. Limits: photos ≤ 5 MB (Claude), videos ≤ 20 MB (Telegram's
bot download cap). Links are fetched with yt-dlp. Private or login-only
posts (often Instagram) can't be downloaded; save the video and send it
as a file instead.

## How approval gates work

n8n paused a running execution at a Wait node. The API keeps no paused
state at all:

1. A step finishes and calls `open_gate()`, which inserts a `pending`
   `approval_stages` row with `resume_url = {PUBLIC_API_URL}/api/approvals/{id}/resume`.
2. The dashboard shows it. On approve, it POSTs the reviewer's input to `resume_url`.
3. `resume()` flips the row to `approved` (once only) and runs the next
   step in the background, reading everything it needs from Postgres.

Jobs therefore survive restarts. If a step fails (bad key, quota, model
error), the job goes to `status = 'failed'` with the reason in
`data.error`. The job page then shows it with a **Retry step** button.

## Environment variables

Read from the repo-root `.env` at startup (restart the API after editing it).
Real environment variables take precedence.

| Var | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | every Claude step |
| `GEMINI_API_KEY` | blog hero (Imagen 4), Image Maker, Image Gen, video analysis, inspiration videos |
| `OPENAI_API_KEY` | guideline narration (TTS) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_IDS` | Telegram inspiration bot (optional; off when unset) |
| `SANITY_API_TOKEN` (+ `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SITE_URL`) | Publish to Sanity |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler** |
| `PUBLIC_API_URL` | the API's URL as the browser sees it (default `http://localhost:8000`) |
| `CORS_ORIGINS` | dashboard origins (default `http://localhost:3000`) |

## Changing a prompt

Live system prompts are in `app/prompts.py`; the user-message wording sits
next to each call. Image Gen reads `prompts/image-gen-draft.md` directly.
With `--reload` (what `dev.ps1` uses), saving a file under `backend/`
restarts the API in about a second.

## Tests

Tests need a Postgres they can create schemas in. A second free Supabase
project works well; don't point them at your real one.

```powershell
cd backend
pip install -r requirements-dev.txt
$env:TEST_DATABASE_URL="<session pooler string of a spare Supabase project>"
pytest
```

Each run builds a throwaway `pd_test_*` schema from `db/schema.sql` and
drops it afterwards. No real API is called. The tests also check that the
row-level security rules let your email through and block everyone else.
