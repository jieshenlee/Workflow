# Image Checker — Setup Guide

Standalone pre-send QC tool: **any image + the brief/request it was
supposed to fulfil -> AI summary of what's in the image, a grammar check
of any text baked into it, and a match verdict against the request.**
Manual trigger only — you upload an image, paste in what was requested,
and click **Verify** before sending it out. Exists to catch the wrong
image being sent for the wrong request.

Workflow: `image-check.json`
Webhook: `POST http://localhost:5678/webhook/image-check`

| Step | Node | Does |
|---|---|---|
| 1 | Webhook | Receives `{ request_text, image_b64, mime_type }` |
| 2 | Parse Input | Validates input, builds the QC prompt |
| 3 | Claude Vision Check | `claude-sonnet-4-6` vision call — reads the image, transcribes any baked-in text, checks its grammar, and judges whether the image matches `request_text` |
| 4 | Format Response | Extracts summary / extracted_text / grammar_issues / verdict / verdict_reason, returns them to the dashboard |

The workflow itself is stateless — it doesn't write to Postgres. The
dashboard creates the `image_checks` row (`status: 'checking'`) before
calling the webhook, then PATCHes the row with the returned result. This
mirrors the Image Maker tool's pattern.

## Step 1 — Run the DB migration

```powershell
Get-Content db\migrate-image-check.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

Creates `image_checks` (`request_text`, `image_b64`, `mime_type`, `status`,
`summary`, `extracted_text`, `grammar_issues`, `verdict`, `verdict_reason`,
`error`, ...).

## Step 2 — Import this workflow

```powershell
docker compose cp .\workflows\image-check.json n8n:/tmp/image-check.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/image-check.json
```

Reload n8n (F5).

## Step 3 — Reconnect credentials

You already created and tested this in the earlier workflows — just
reattach it on the new node:

| Node | Credential |
|---|---|
| Claude Vision Check | `Header Auth account` (the existing Anthropic key used by every other workflow) |

Activate the workflow.

## Notes

- **Model**: `claude-sonnet-4-6` — grammar-checking baked-in image text
  needs careful reading, so this uses the stronger model rather than
  haiku (same tier `guidelines-capture.json` uses for its PDF-extraction
  node).
- **`verdict` values**: `match`, `partial_match`, `mismatch`. If Claude's
  JSON is unparseable or returns something unexpected, Format Response
  defaults to `partial_match` rather than silently claiming a match —
  treat that as "re-check by eye."
- **This tool is generic on purpose**: `request_text` is free text, so it
  works whether "the request" is a client brief, a platform spec, or a
  note to yourself about what an image was for. There's no client/account
  concept in the schema — if you later want to tag checks by client or
  job, add a column then.
