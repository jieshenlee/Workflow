# Video Template Extract — Setup Guide

Branch 5. Paste a YouTube URL into the dashboard's **Video Templates**
page and pick one of two modes; the workflow tries Gemini watching the
video directly first, and falls back to scraping the video's transcript
(via a yt-dlp sidecar) + Claude if Gemini fails, to extract either a
Mermaid flowchart of the process or an ordered checklist. No approval
gate — the rendered flowchart / editable checklist in the dashboard is
itself the review step, same as the standalone Image Checker tool.

Workflow: `video-template-extract.json`
Trigger: one webhook, called directly by the dashboard, `mode` in the
body decides which prompt/branch runs (`POST /webhook/video-template-extract`)

## Why Gemini-first with a fallback, instead of just one approach

Two things were tried and both had real problems on their own:

- **Gemini watching the video directly** (via a `fileData` part pointing
  at the YouTube URL, no download needed) is fast and can see on-screen
  content, not just narration. But in testing, Google's API returned
  `403 PERMISSION_DENIED: "Your project has been denied access"` on most
  attempts (worked once, then failed 3 of the next 4 tries) — this looks
  like a project/tier-level restriction on the direct-YouTube-URL
  video-ingestion feature specifically, not a general outage.
- **Scraping YouTube's caption track directly** (fetching the
  `"captionTracks"` URL embedded in the watch page) turned out to be
  broken outright — tested against two different videos, including one
  with manually-uploaded (non-auto-generated) captions, and both returned
  HTTP 200 with a **0-byte body**. YouTube has locked down this legacy
  method for anonymous requests; it's not fixable with a header tweak.
- **yt-dlp**, a dedicated and actively-maintained tool built specifically
  to survive YouTube's anti-scraping changes, *does* still reliably pull
  captions (real content, correctly decoded, verified in testing) — but
  it needs Python + a package manager, and n8n's official Docker image
  (`docker.n8n.io/n8nio/n8n:latest`) is now a hardened Alpine build with
  neither, so it can't run inside the n8n container itself.

So this workflow tries Gemini first (fast, whole-video understanding,
free if Gemini access is working), and only pays for a Claude call +
yt-dlp fetch when Gemini fails. Both credentials are ones this repo
already uses elsewhere — no new API cost/signup unless you count running
one more small container.

## Architecture

| Step | Node | Does |
|---|---|---|
| 1 | `Extract Webhook` | Fires when the dashboard submits `{youtube_url, mode}` |
| 2 | `Prepare Data` | Normalizes the body, defaults `mode` to `flowchart` |
| 3 | `Is Flowchart? (Gemini)` | Routes to the matching Gemini prompt by `mode` |
| 4 | `Gemini - Extract Flowchart` / `Gemini - Extract Checklist` | `gemini-2.5-flash` watches the video via `fileData` pointing at the URL. `onError: continueRegularOutput` so a failure doesn't kill the execution |
| 5 | `Check Gemini Flowchart` / `Check Gemini Checklist` | Parses the response (or notices an API error), validates the result, defensively re-quotes Mermaid labels; outputs `ok: true/false` |
| 6 | `Gemini Flowchart OK?` / `Gemini Checklist OK?` | If Gemini succeeded, go straight to `Save Template`. If not, fall through to the transcript path |
| 7 | `Fetch Transcript` | GETs `http://transcript-service:8811/transcript?url=...` — the yt-dlp sidecar (60s timeout; yt-dlp extraction isn't instant) |
| 8 | `Parse Transcript Response` | Checks the sidecar's `{ok, transcript, error}` shape |
| 9 | `Has Transcript?` | If no transcript either, go to `Build Both Failed Result`. Otherwise continue |
| 10 | `Is Flowchart? (Claude Fallback)` | Routes to the matching Claude prompt by `mode` |
| 11 | `Claude - Extract Flowchart` / `Claude - Extract Checklist` | `claude-sonnet-4-6` reads the transcript text (prompt from `prompts/video-flowchart.md` / `prompts/video-checklist.md`, inlined) |
| 12 | `Parse Flowchart Result` / `Parse Checklist Result` | Same parse/validate/sanitize idiom as step 5, reading Claude's response shape instead of Gemini's |
| 13 | `Build Both Failed Result` | Only reached if both Gemini and the transcript fallback failed — builds a clear failed row instead of a crash |
| 14 | `Save Template` | Single Postgres insert into `video_templates` — every path (Gemini success, Claude-fallback success, or total failure) converges here |
| 15 | `Respond OK` | Returns the saved row as JSON — always valid JSON, `success: false` + a real error message on any failure, never an empty body |

## The transcript-service sidecar

`transcript-service/` is a small Flask app (`app.py`) wrapping yt-dlp,
built from `transcript-service/Dockerfile` and run as the
`transcript-service` container in `docker-compose.yml`. It exposes:

```
GET /transcript?url=<youtube_url>
  -> {"ok": true, "title": "...", "transcript": "..."}
  -> {"ok": false, "error": "..."}
```

It downloads the caption track only (`skip_download: True`, so no video
file is ever saved), converts the resulting `.vtt` to plain text (strips
cue timing/tags, decodes HTML entities, dedupes the repeated/overlapping
lines that auto-generated "rolling" captions produce), and returns up to
50,000 characters of transcript. Runs on the internal Docker network as
`transcript-service:8811`; also published to `127.0.0.1:8811` on the host
for direct debugging (`curl "http://localhost:8811/transcript?url=..."`).

## Why no approval gate

Unlike the Blog/Social pipelines, nothing here publishes externally — the
output is a working artifact (a diagram to reference, a checklist to
download and fill in). The dashboard result panel *is* the review: you
see the rendered Mermaid diagram or edit the checklist inline before
downloading anything. This matches the Image Checker precedent, not the
6-stage Branch 1/2 approval flow.

## Step 1 — Run the DB migration

```powershell
Get-Content db\migrate-video-templates.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

Creates `video_templates` plus the `video_template_mode` /
`video_template_status` enums. (Also folded into `db/schema.sql` for
fresh database bootstraps.)

## Step 2 — Build and start the transcript-service sidecar

```powershell
docker compose build transcript-service
docker compose up -d transcript-service
```

Sanity check it directly before wiring up n8n:

```powershell
curl "http://localhost:8811/transcript?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Step 3 — Import the workflow

```powershell
docker compose cp .\workflows\video-template-extract.json n8n:/tmp/video-template-extract.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/video-template-extract.json
```

If your n8n runs on the newer draft/publish model (check with
`n8n publish:workflow --help` — if that command exists, you're on it),
importing leaves the workflow **deactivated** as a new draft. Publish and
restart to make it live:

```powershell
docker compose exec -T n8n n8n publish:workflow --id=videotemplateextract
docker compose restart n8n
```

(On older n8n versions without the publish/draft model,
`n8n update:workflow --id=videotemplateextract --active=true` followed by
a restart does the same thing.)

Confirm it registered by checking the container logs after restart for an
`Activated workflow "Video Template Extract ..."` line.

## Step 4 — Attach credentials

| Node(s) | Credential | Notes |
|---|---|---|
| `Gemini - Extract Flowchart`, `Gemini - Extract Checklist` | `Gemini API Key` (existing `HTTP Header Auth` credential, header `x-goog-api-key`) | Already exists — just reattach if the import didn't carry the credential ID over. **If you keep hitting the 403 "project has been denied access" error, generate a fresh key from a different/new Google Cloud project at aistudio.google.com and paste it into this same credential** — no workflow changes needed, just update the key value. |
| `Claude - Extract Flowchart`, `Claude - Extract Checklist` | `Header Auth account` (the existing Anthropic key used by every other workflow) | Already exists — just reattach |

No new credential needed for the transcript-service — it's an
unauthenticated internal call over the Docker network.

## Step 5 — Install dashboard dependencies

```powershell
cd dashboard
npm install
```

Pulls in `mermaid` (flowchart rendering), `exceljs` (Excel export), and
`pptxgenjs` (PPT export) — all loaded via dynamic `import()` so they don't
bloat the initial bundle (same pattern already used for `docx` in
`src/lib/export.ts`).

## Step 6 — Test it

At `/video-templates`, paste a real YouTube tutorial URL, pick
**Tutorial → Flowchart**, click Generate. If Gemini's access is working
you'll get a result in ~30–60s; if it 403s, expect ~1–2 minutes total
while it falls through to the transcript+Claude path. Try
**Video → Checklist** on the same URL — download both Excel and PPT and
confirm they open correctly. Try a URL with no captions and a broken/dead
Gemini key to confirm the double-failure path still responds with a clear
error instead of hanging or crashing.

Check the row landed:

```powershell
docker compose exec -T postgres psql -U projectdigital -d projectdigital -c "SELECT mode, title, status, error_message, created_at FROM video_templates ORDER BY created_at DESC LIMIT 5;"
```

## Notes

- **Failure handling is soft everywhere**: every httpRequest node that
  talks to an external service (Gemini, the transcript sidecar, Claude)
  has `onError: continueRegularOutput`, so a failure anywhere produces a
  clear `error_message` on a `failed` row instead of an empty webhook
  response or a hard crash. This was a real bug found and fixed during
  development — the first version had no error handling at all, and any
  Gemini failure produced an empty 200 response that broke the
  dashboard's `res.json()` call.
- **Mermaid label quoting is defensive, not just prompted**: both the
  Gemini and Claude prompts explicitly ask for quoted node labels, and
  both `Check Gemini Flowchart` and `Parse Flowchart Result` additionally
  run a regex pass that force-quotes any label the model left unquoted —
  found necessary because LLMs reliably forget this for labels containing
  parentheses, which otherwise breaks Mermaid's parser.
- **Caption scraping (inside `transcript-service`) is unofficial** —
  yt-dlp reverse-engineers YouTube's internal APIs and is actively
  maintained to keep working as YouTube changes things, unlike the naive
  direct-URL approach this replaced. If it ever stops working, check for
  a yt-dlp version bump (`transcript-service/requirements.txt`) before
  assuming the whole approach is dead again.
- **Models**: `gemini-2.5-flash` and `claude-sonnet-4-6`. If either 404s,
  the model ID may have shifted — check the provider's docs.
- **Prompts live in `prompts/video-flowchart.md` / `prompts/video-checklist.md`**
  for reference — these document the Claude/transcript-reading prompts.
  The Gemini video-watching prompts only exist inline in the workflow
  JSON (they're a different framing — "watching" vs "reading a
  transcript" — so didn't get their own doc files). Matching how every
  other workflow in this repo works, the actual text sent to any model is
  inlined directly in the node's `jsonBody`, not read from disk at
  runtime — edit both places if you change a prompt.
