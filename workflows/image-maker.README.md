# Image Maker — Setup Guide

One action: **reference image + instruction → edited image + 3 slogans.**
No vision analysis step, no font detection, no approval gate — Gemini's
multimodal model edits the reference image directly from your instruction.

Workflow: `image-maker.json`
Webhook: `POST http://localhost:5678/webhook/image-maker`

| Step | Node | Does |
|---|---|---|
| 1 | Webhook | Receives `{ instruction, reference_image_b64, reference_mime_type }` |
| 2 | Parse Input | Validates input, builds the slogan prompt |
| 3 | Gemini Image Edit | `gemini-2.5-flash-image` `:generateContent` — takes the reference image + instruction, returns an edited image |
| 4 | Claude Slogans | Writes 3 short slogans from the instruction text |
| 5 | Format Response | Extracts the image + slogans, returns them to the dashboard |

## Step 1 — Run the DB migration

```powershell
Get-Content db\migrate-image-maker.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

This drops and recreates `image_maker_projects` with the simplified shape
(`instruction`, `reference_image_b64`, `status`, `slogans`,
`generated_image_b64`, ...). Only test rows existed under the old shape —
nothing of value is lost.

## Step 2 — If you already set up the old two-workflow version

You'll have **Image Maker — Prompt** and **Image Maker — Image** sitting in
n8n from the earlier (more complicated) version of this feature. Deactivate
or delete both — they're superseded by this single workflow.

## Step 3 — Import this workflow

```powershell
docker compose cp .\workflows\image-maker.json n8n:/tmp/image-maker.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/image-maker.json
```

Reload n8n (F5).

## Step 4 — Reconnect credentials

You already created and tested both of these in the earlier version — just
reattach them on the new nodes:

| Node | Credential |
|---|---|
| Gemini Image Edit | your `HTTP Header Auth` credential with header `x-goog-api-key` (Gemini key) |
| Claude Slogans | `Header Auth account` (the existing Anthropic key used by every other workflow) |

Activate the workflow.

## Notes

- **Model name**: `gemini-2.5-flash-image`. If you get a 404, the model ID
  may have shifted — try `gemini-2.5-flash-image-preview` in the Gemini
  Image Edit node's URL instead.
- **Billing**: this still calls a Gemini image model via the API, which
  generally needs billing enabled on your Google AI Studio project
  (https://aistudio.google.com → billing) — same requirement as Imagen.
- **Aspect ratio**: Gemini's image edit preserves whatever the reference
  image's framing is — it doesn't force a specific output ratio. Crop to
  4:5 in Canva as you add any further overlay.
