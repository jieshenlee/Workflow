# Inspiration Capture — Setup Guide

Forward a trending photo or short video clip to a Telegram bot; the AI tags
it with a category + a short summary of why it's engaging, and it lands in
the `inspiration_items` table for the Brainstorm stage to pull from later.

Workflow: `inspiration-capture.json`
Trigger: Telegram bot (no webhook URL to call manually — n8n registers the
Telegram webhook for you once the workflow is active)

| Step | Node | Does |
|---|---|---|
| 1 | Telegram Trigger | Fires on any message sent to the bot |
| 2 | Classify Message | Reads the Telegram update, decides photo / video / unsupported |
| 3 | Is Photo? / Is Video? | Routes to the matching branch |
| 4a | Download Photo → Photo To Base64 | Pulls the largest photo size, base64-encodes it |
| 5a | Claude Vision - Tag Photo | `claude-haiku-4-5` looks at the image + caption, returns category/summary/tags |
| 6a | Parse Photo Tags → Save Photo Inspiration | Validates the category, inserts the row |
| 4b | Download Video → Video To Base64 | Downloads the full clip, base64-encodes it |
| 5b | Download Thumbnail → Thumbnail To Base64 | Grabs Telegram's auto-generated thumbnail (cheap preview image — the full clip itself isn't kept) |
| 6b | Gemini Video Analysis | `gemini-2.5-flash` watches the clip directly (no frame extraction / ffmpeg needed — Gemini accepts video natively via `inlineData`) |
| 7b | Parse Video Tags → Save Video Inspiration | Validates the category, inserts the row |
| 8 | Reply Photo/Video Saved | Bot replies in Telegram confirming the category + summary |

## Why no frame-extraction / ffmpeg step

The original sketch was "download → break into frames → extract images →
tell the AI what to do." In practice, Gemini's multimodal models accept a
video file directly in the same `generateContent` call already used for
image editing in `image-maker.json` — no frame extraction needed. That
avoids building/maintaining a custom n8n Docker image with ffmpeg installed
just for this, which would be more infra than an MVP-stage feature
justifies (same reasoning as the Postiz → Metricool reversion — see
`STATUS.md`). If Gemini's video understanding turns out to be too coarse
for your clips, frame extraction is the fallback — flag it and we'll add
the ffmpeg step then.

The full video itself isn't persisted anywhere after analysis — only
Telegram's auto-thumbnail is stored as the preview image (keeps the table
light). Re-fetch the original from Telegram chat history if you need to
rewatch a clip.

## Step 1 — Create the Telegram bot

1. Open Telegram, message **@BotFather**.
2. `/newbot` → give it a name and a username (must end in `bot`).
3. Copy the token it gives you (looks like `123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
4. Paste it into `.env` as `TELEGRAM_BOT_TOKEN` (for your own record — n8n
   needs it pasted again into its own credential in Step 4).
5. Message your new bot once on Telegram (send literally anything) so it
   has a chat to reply into — bots can't message you first.

## Step 2 — Run the DB migration

```powershell
Get-Content db\migrate-inspiration.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

Creates `inspiration_items` plus the `inspiration_type` /
`inspiration_category` enums. (Also folded into `db/schema.sql` for fresh
database bootstraps.)

## Step 3 — Import the workflow

```powershell
docker compose cp .\workflows\inspiration-capture.json n8n:/tmp/inspiration-capture.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/inspiration-capture.json
```

Reload n8n (F5).

## Step 4 — Attach credentials

| Node(s) | Credential | Notes |
|---|---|---|
| Telegram Trigger, Download Photo/Video/Thumbnail, Reply Photo/Video Saved | New **Telegram API** credential — paste the bot token from Step 1 | One credential, reused on every Telegram node |
| Claude Vision - Tag Photo | `Header Auth account` (the existing Anthropic key used by every other workflow) | Already exists — just reattach |
| Gemini Video Analysis | Your existing `HTTP Header Auth` credential with header `x-goog-api-key` (the same one used by `image-maker.json`'s Gemini Image Edit node) | Already exists — just reattach |

Activate the workflow. n8n registers the Telegram webhook automatically on
activation (no manual webhook URL/port forwarding needed, even on
localhost — n8n's Telegram node uses long-polling-free webhook
registration through Telegram's servers... but if your n8n isn't reachable
from the internet, see the note below).

> **If n8n runs on localhost with no public URL:** Telegram needs to reach
> n8n's webhook, which means `localhost:5678` alone won't work from
> Telegram's servers. Either tunnel it (e.g. `ngrok http 5678`, then set
> `N8N_EDITOR_BASE_URL`/`WEBHOOK_URL` to the tunnel URL before activating),
> or skip the trigger registration step and poll instead — ask if you want
> a polling variant.

## Step 5 — Test it

Send a screenshot of a trending post, or forward a short video clip (most
apps have a native "Share → Telegram" option), to your bot. It should
reply within a few seconds with the assigned category and a one-line
summary. Check the row landed:

```powershell
docker compose exec -T postgres psql -U projectdigital -d projectdigital -c "SELECT type, category, ai_summary, created_at FROM inspiration_items ORDER BY created_at DESC LIMIT 5;"
```

## Notes

- **Categories**: `tv_shows, streaming, gadgets, tools, games, movies, ai,
  anime, esports, other` — matches the breakdown from the original
  sketch (the two "movies" entries collapsed into one). Edit the enum in
  `db/migrate-inspiration.sql` / `schema.sql` and the prompts in both
  "Claude Vision - Tag Photo" and "Gemini Video Analysis" nodes together if
  you want to change the list.
- **Video size**: Telegram bots can download files up to 20MB. Gemini's
  inline video limit is similar — fine for short clips, but a long Reel
  capture may fail at either step. If that happens often, switch to
  Gemini's File API (upload then reference by URI) instead of inline data.
- **Model names**: `claude-haiku-4-5-20251001` and `gemini-2.5-flash`. If
  either 404s, the model ID may have shifted — check the provider's docs
  for the current multimodal model name.
