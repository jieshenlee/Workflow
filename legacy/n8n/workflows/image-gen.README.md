# Image Gen — Setup Guide

The "Contact Sheet to Post" tool from `HANDOFF.md`, rebuilt on this
project's stack (n8n + PostgREST + React dashboard) instead of the
separate Next.js app + worker:

**a short ask + a brand's reference images → AI-drafted prompt checked
against the brand brief → you edit the prompt → rendered at each size →
you review each image.**

Dashboard page: http://localhost:3000/image-gen

A **brand** shows up in the UI as a **Project**. Each project has its own
brief and reference images. Nothing is trained per brand: the references
go along with every draft and every render.

## Pipeline

| Step | Where | Does |
|---|---|---|
| 1. Draft | `image-gen-draft.json` (synchronous webhook) | `claude-haiku-4-5` (vision) looks at the selected reference images, the ask and the brief, writes a generation prompt and checks it against the brief → `{ prompt, brief_check: { passes, issues[], notes } }`. No DB row yet. Prompt: `prompts/image-gen-draft.md`. |
| 2. Edit & queue | dashboard | You edit the drafted prompt, then **Render**. The dashboard writes an `image_gen_jobs` row (`queued`) + one `image_gen_generations` row per size (`rendering`), then POSTs `{ job_id }` to the render webhook. |
| 3. Render | `image-gen-render.json` (responds immediately, then keeps running) | Reads the job + its references from PostgREST, calls `gemini-2.5-flash-image` once per size **with the reference images attached** and the size's aspect ratio set, then PATCHes each generation (`done`/`failed`) and the job (`done`/`failed`) back through PostgREST. The dashboard polls every 4 s while anything is queued or running. |
| 4. Review | dashboard (approval gate) | Per image: **Approve** (then Download / Save to library), **Changes** (your note + the previous prompt are redrafted, and a new child job is queued for that size), **BG only**, **Split**. |

`image_gen_jobs.status` is the queue; there's no separate worker process.
The render runs inside n8n, so closing the browser tab doesn't stop it.

### Sizes

| Key | Label | Gemini aspect | Exact output (applied on download / save) |
|---|---|---|---|
| `post` | Square post | 1:1 | 1080×1080 |
| `portrait` | Portrait post (Meme / Static / Carousel) | 4:5 | 1080×1350 |
| `story` | Story / Reel | 9:16 | 1080×1920 |
| `banner` | Banner | 16:9 | 1200×628 (centre-cropped from 16:9) |

Gemini renders at the true aspect ratio. The exact pixel size is a centre
crop done in the browser (`cropToSize` in `dashboard/src/lib/imageGen.ts`)
when you click **Download** or **Save to library**. The size table appears
twice, in the "Build Requests" node and in `dashboard/src/lib/imageGen.ts`,
so update both if you change it.

## Step 1 — Run the DB migration

```powershell
Get-Content db\migrate-image-gen.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
docker compose restart postgrest
```

Creates `brand_projects`, `brand_references`, `image_gen_jobs`,
`image_gen_generations`. Idempotent. Restart PostgREST or the embeds
404 (schema cache).

## Step 2 — Import both workflows

```powershell
docker compose cp .\workflows\image-gen-draft.json n8n:/tmp/image-gen-draft.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/image-gen-draft.json
docker compose cp .\workflows\image-gen-render.json n8n:/tmp/image-gen-render.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/image-gen-render.json
```

Reload n8n (F5).

## Step 3 — Reconnect credentials

No new credentials: these are the same two the Image Maker uses.

| Workflow | Node | Credential |
|---|---|---|
| Image Gen - Draft | Claude Draft Prompt | `Header Auth account` (the Anthropic key) |
| Image Gen - Render | Gemini Render | your `HTTP Header Auth` credential with header `x-goog-api-key` (Gemini key) |

The PostgREST nodes in the render workflow (`Fetch Job`, `Mark Running`,
`Fetch References`, `Save Generation`, `Finish Job`) need **no**
credential. They call `http://postgrest:3000` over the internal compose
network.

Activate both workflows. Then restart n8n (see "Gotchas" in `STATUS.md`).

## Step 4 — Try it

1. `/image-gen` → **New project** → name + brief.
2. **References** tab → upload a few past posts / brand photos (≤ 5 MB each).
3. **Generate** tab → type an ask, pick sizes → **Draft prompt** → read
   the brief check, edit the prompt → **Render**.
4. Review each image when it lands.

## Notes

- **Cost.** About $0.039 per rendered image (Gemini 2.5 Flash Image list
  price; the Spend tab uses that figure). Drafting with Haiku is a
  fraction of a cent. Needs billing enabled on the Google AI Studio
  project, the same requirement as Imagen.
- **Reference limits.** At most 6 references go to each draft/render call
  (`MAX_REFERENCES_PER_DRAFT`). Uploads are capped at 5 MB each because
  Claude vision rejects bigger images.
- **Model 404.** If `gemini-2.5-flash-image` 404s, try
  `gemini-2.5-flash-image-preview` in the Gemini Render node's URL. If
  `imageConfig.aspectRatio` is rejected on your API version, delete it
  from "Build Requests". The prompt still names the aspect ratio, and the
  download crop still gives exact sizes.
- **Stuck job.** If n8n was down or the workflow wasn't active, the job
  is marked `failed` with "Could not start render workflow". If n8n died
  mid-run, the job stays `running`. Either way, **Retry** on the job card
  re-renders every size that isn't `done`.
- **BG only / Split** only record the decision for now. Background
  removal and per-element re-prompting aren't built yet (same as in the
  handoff).
- **Approval gate.** Nothing leaves this tool on its own. Approved images
  go into the Image Library only when you click **Save to library**.

## Differences from the original Next.js app (HANDOFF.md)

| Original | Here | Why |
|---|---|---|
| `gpt-4o-mini` drafts the prompt | Claude Haiku 4.5 (vision) | Claude is this project's content model, and its key is already in n8n |
| `gpt-image-1` `images.edit` | `gemini-2.5-flash-image` with inline references | The Gemini credential already exists. It takes multiple reference images in a JSON body (no multipart in n8n) and renders true 9:16 / 4:5 / 16:9 instead of approximating |
| Polling Node worker | n8n webhook that responds immediately and writes back via PostgREST | No extra process to run |
| No crop step (approximate ratios) | Exact-size crop on download / save | Was #3 on the handoff's "not done" list |
| Pollinations keyless fallback | none | n8n always has the keys; a failed render shows its error + Retry |
| Per-user OpenAI key, auth, R2 | not ported | Single-user local tool, same as the rest of the dashboard. Images live as base64 in Postgres like `images` does |
