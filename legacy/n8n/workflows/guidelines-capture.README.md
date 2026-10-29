# Guidelines Capture — Setup Guide

Branch 4. Upload a PDF, a blog URL, or a screenshot of reference/guideline
material from the dashboard; Claude extracts the text and suggests a
category + summary; you confirm/edit the category from "Pending review" in
the dashboard; on confirm, OpenAI narrates the summary and the item becomes
a published guideline page at `/guidelines/:id`.

Workflow: `guidelines-capture.json`
Trigger: two webhooks, both called directly by the dashboard (no Telegram
bot involved here — see `inspiration-capture.README.md` for that pattern)

| Step | Node | Does |
|---|---|---|
| 1 | Upload Webhook (`POST /webhook/guideline-upload`) | Fires when the dashboard's Guidelines page uploads a file or submits a blog URL |
| 2 | Prepare Data | Normalizes the body (handles both raw and `{body: {...}}` shapes) |
| 3 | Is PDF? / Is Screenshot? | Routes to the matching branch by `source_type` |
| 4a | Claude - Analyze PDF | `claude-sonnet-4-6` reads the PDF natively via a `document` content block (base64) — no separate parsing library needed |
| 4b | Claude Vision - Analyze Screenshot | `claude-haiku-4-5` reads the image, same pattern as Branch 3's photo tagging |
| 4c | Fetch Blog Page → Strip HTML → Claude - Analyze Blog Text | Fetches the URL, strips tags to plain text in a Code node, then `claude-sonnet-4-6` extracts the article + drops nav/ad boilerplate |
| 5 | Parse \*/Save \* Guideline | Validates the JSON, inserts into `guideline_items` with `status = pending_review` |
| 6 | Respond \* OK | Returns `{id, title, category, summary}` so the dashboard can show the result inline |
| 7 | Confirm Webhook (`POST /webhook/guideline-confirm`) | Fires when you click **Confirm** on a pending item in the dashboard, body `{id, category, summary}` |
| 8 | OpenAI TTS - Narrate Summary | `tts-1` narrates the (possibly edited) summary, returned as binary audio |
| 9 | Encode Audio | Reads n8n's binary data as base64 (n8n already stores binary internally as base64, so this is just a field read, not a real conversion) |
| 10 | Publish Guideline | Updates the row: confirmed `category`, `audio_b64`, `status = published` |
| 11 | Respond Confirm OK | `{success: true, id}` |

## Why PPTX isn't supported here

Neither Claude's API nor n8n can parse `.pptx` natively (Claude's `document`
content type is PDF-only). Building real PPTX support means a
LibreOffice-headless conversion service — a new Docker container plus a
conversion workflow — which is disproportionate infra for what's currently a
hand-drawn sketch of this feature. The dashboard's upload panel tells users
to export PowerPoint to PDF first (File → Export → Create PDF/XPS in
PowerPoint) and upload the PDF instead. Revisit if PPT volume turns out to be
high enough to justify the extra service.

## Why the confirm step doesn't re-query Postgres

`Confirm Webhook` receives `{id, category, summary}` directly from the
dashboard rather than looking the row up again — the dashboard already has
`ai_summary`/`ai_category` in memory from the query that rendered the
"Pending review" list, so there's no need for an extra Postgres SELECT node.
This matches how every other workflow in this repo is built: data flows
forward through the trigger payload and `$('Node Name').first().json`
references, never a mid-flow read-back.

## Step 1 — Run the DB migration

```powershell
Get-Content db\migrate-guidelines.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

Creates `guideline_items` plus the `guideline_source_type` /
`guideline_status` enums. (Also folded into `db/schema.sql` for fresh
database bootstraps.)

## Step 2 — Import the workflow

```powershell
docker compose cp .\workflows\guidelines-capture.json n8n:/tmp/guidelines-capture.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/guidelines-capture.json
```

Reload n8n (F5).

## Step 3 — Attach credentials

| Node(s) | Credential | Notes |
|---|---|---|
| Claude - Analyze PDF, Claude Vision - Analyze Screenshot, Claude - Analyze Blog Text | `Header Auth account` (the existing Anthropic key used by every other workflow) | Already exists — just reattach |
| OpenAI TTS - Narrate Summary | **New** HTTP Header Auth credential — header `Authorization`, value `Bearer <OPENAI_API_KEY>` | No workflow in this repo has used OpenAI yet (image gen uses Gemini Imagen), so this credential needs to be created from scratch in n8n's Credentials screen, then attached here |

Activate the workflow (registers both webhook paths at once — they're two
trigger nodes in the same workflow, same as how `blog-path-complete.json`
exposes multiple webhooks under one active toggle).

## Step 4 — Test it

Upload a real PDF or paste a blog URL from the dashboard's Guidelines page
(`/guidelines`). It should land in "Pending review" within a few seconds
with an AI-suggested category and summary. Check the row:

```powershell
docker compose exec -T postgres psql -U projectdigital -d projectdigital -c "SELECT source_type, title, category, status, created_at FROM guideline_items ORDER BY created_at DESC LIMIT 5;"
```

Edit the category if needed and click **Confirm** — watch the n8n execution
list for the `guideline-confirm` webhook firing, then confirm `status`
flips to `published` and `audio_b64` is non-empty. Open the item's
`/guidelines/:id` page and check the audio actually plays.

## Notes

- **Category is free text**, not a fixed enum — guideline topics (brand
  voice, legal, SEO rules, tone, formatting, ...) are open editorial
  territory, unlike Branch 3's fixed content taxonomy. Claude's suggestion
  is just a starting point; edit it freely before confirming.
- **Summary is trimmed to ~3800 chars** before hitting OpenAI TTS, which caps
  input at ~4096 characters. The narration is always of the summary, not the
  full `extracted_text` — full text still renders on the guideline page.
- **Blog scraping is a plain tag-strip**, not a real readability extractor —
  fine for most blog templates, but a heavily-scripted SPA blog may return
  thin or garbled text. If that happens often, consider swapping the
  `Strip HTML` Code node for a proper readability service.
- **Model names**: `claude-sonnet-4-6` (PDF/blog — needs to read a full
  document well), `claude-haiku-4-5-20251001` (screenshot — single image,
  same tier as Branch 3's photo tagging), `tts-1` (OpenAI TTS). If any 404s,
  the model ID may have shifted — check the provider's docs.
