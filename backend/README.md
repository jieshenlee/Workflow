# Project Digital API (`backend/`)

Python (FastAPI) backend that replaced the n8n workflows on 2026-10-29.
Every AI call, approval gate and external integration lives here as
plain Python, in git, with tests.

- **Runs as** the `api` service in `docker-compose.yml` → http://localhost:8000
- **Interactive docs:** http://localhost:8000/docs (try any endpoint from the browser)
- **Health + which keys are set:** http://localhost:8000/health
- **Logs:** `docker compose logs -f api`

The dashboard still reads and writes plain table data through PostgREST.
The API handles anything that calls a model or an outside service.

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
2. In `.env`, set `TELEGRAM_BOT_TOKEN=<token>`, then run `docker compose up -d --force-recreate api`.
3. Message your bot anything. It replies "This bot is private… add <your id> to TELEGRAM_ALLOWED_CHAT_IDS".
4. Set `TELEGRAM_ALLOWED_CHAT_IDS=<that id>` in `.env` and recreate the api container again. Done.

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

Passed through from `.env` by docker-compose.

| Var | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | every Claude step |
| `GEMINI_API_KEY` | blog hero (Imagen 4), Image Maker, Image Gen, video analysis, inspiration videos |
| `OPENAI_API_KEY` | guideline narration (TTS) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_IDS` | Telegram inspiration bot (optional; off when unset) |
| `SANITY_API_TOKEN` (+ `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SITE_URL`) | Publish to Sanity |
| `DATABASE_URL` | set by compose; override when running outside Docker |
| `PUBLIC_API_URL` | the API's URL as the browser sees it (default `http://localhost:8000`) |
| `CORS_ORIGINS` | dashboard origins (default `http://localhost:3000`) |

## Changing a prompt

Live system prompts are in `app/prompts.py`; the user-message wording sits
next to each call. Image Gen reads `prompts/image-gen-draft.md` directly.
With `--reload` (the compose default), saving a file restarts the API in
about a second.

## Tests

```powershell
docker compose up -d postgres
cd backend
pip install -r requirements-dev.txt
$env:TEST_DATABASE_ADMIN_URL="postgresql://projectdigital:<POSTGRES_PASSWORD>@localhost:5432/postgres"
pytest
```

Each run creates a throwaway database from `db/schema.sql` and drops it
afterwards. No real API is called.
