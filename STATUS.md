# Project Digital — Current Status

> Living progress doc. Read this at the start of every session to know what's
> built, what works, and what to build next. `CLAUDE.md` is the stable project
> definition; this file is the moving target. Update it as things change.

_Last updated: 2026-08-23_

---

## TL;DR for a new chat

**Stages 1–4 are working end-to-end** in n8n + the React dashboard:
Brainstorm → Outline → Draft → Image. A job has gone all the way to `cms`
(Ready to publish) with a real AI-generated hero image saved.

**Stage 5 (Publish to Sanity CMS) is fully built on the dashboard side and
mid-wiring on the n8n side.** Sanity project = `p9audgmp` / `production`.
Dashboard has a collapsible publish panel with all the Sanity fields
(title, slug, author, category, excerpt, cover + alt, meta title +
description), each auto-prefilled, AI-generate buttons per field, and a
pre-publish review modal that lists missing sections and applies sensible
defaults on confirm. Three importable n8n workflows ready in `workflows/`:
- `publish-cms.json` — pushes the post to Sanity
- `generate-meta.json` — Claude writes excerpt / alt / meta_title / meta_description on demand
- `repurpose-social.json` — turns the blog into LinkedIn / X / Meta captions

**Social scheduling = Metricool (manual on free tier).** Briefly tried
self-host Postiz 2026-06-01 and reverted same day — Temporal +
Elasticsearch + per-platform OAuth dev apps was too much infra. Dashboard
now has **Copy for Metricool** buttons on every social caption tab that
one-click-copy the body + hashtags so you paste them into metricool.com to
schedule. If you ever upgrade to Metricool paid (~$18/mo) we wire the API
workflow at `workflows/schedule-social.README.md`.

**Next thing to push through:** finish `publish-cms` setup so a blog
actually lands on `project-digital-website.vercel.app/blog`. The
`Upload Cover Image` node's binary-body params + the Sanity credential
selection are the last remaining knobs.

**⚠️ Read this first:** the full n8n workflow (Stages 1–4) still lives
only inside n8n and is **NOT exported to `workflows/`** — that risk is
unchanged from last update. Export + commit it before anything happens
to the container.

**New, unimported, untested (2026-06-30):** `workflows/inspiration-capture.json`
— Branch 3, a Telegram-bot swipe file. Forward a trending photo/video to a
bot; Claude (photos) or Gemini (video, analyzed directly — no ffmpeg)
tags it with a category + summary and stores it in the new
`inspiration_items` table for the Brainstorm stage to pull from. Needs:
DB migration (`db/migrate-inspiration.sql`), a Telegram bot token from
@BotFather, and a public URL/tunnel for the webhook if n8n isn't reachable
from the internet. Full setup in `workflows/inspiration-capture.README.md`.

**New, unimported, untested (2026-07-22):** `workflows/image-check.json`
— standalone pre-send QC tool, separate from Image Maker and the Stage-4
approval gate. Upload any image + paste in what was requested (a client
brief, a platform spec, a note to self — free text, no client concept in
the schema), click **Verify** at `/image-checker`; Claude Vision reads the
image, transcribes any text baked into it, flags grammar/spelling issues
in that text, and returns a `match` / `partial_match` / `mismatch` verdict
against the request with a reason. Manual trigger only (not automatic).
Stored in the new `image_checks` table. Needs: DB migration
(`db/migrate-image-check.sql`) and the workflow imported + activated (no
new credential — reuses the existing Anthropic `Header Auth account`).
Full setup in `workflows/image-check.README.md`.

**New, unimported, untested (2026-07-13):** `workflows/guidelines-capture.json`
— Branch 4, a dashboard-upload reference library. Upload a PDF, blog URL, or
screenshot at `/guidelines`; Claude extracts the text and suggests a
category + summary, stored in the new `guideline_items` table as
`pending_review`; confirm/edit the category in the dashboard, which
triggers OpenAI TTS to narrate the summary and flips the item to
`published`, viewable at `/guidelines/:id` (text + audio). PPT sources are
out of scope for v1 — export to PDF first (no PPTX parser exists in
Claude's API or n8n). Needs: DB migration (`db/migrate-guidelines.sql`) and
a **new** n8n Header Auth credential for `OPENAI_API_KEY` (no workflow has
used OpenAI yet — image gen uses Gemini Imagen). Full setup in
`workflows/guidelines-capture.README.md`.

**Imported and live (2026-08-27):** `workflows/video-template-extract.json`
— Branch 5, a dashboard page at `/video-templates`. Paste a YouTube URL,
pick **Tutorial → Flowchart** or **Video → Checklist**. Tries Gemini
watching the video directly first (`fileData` URL reference, no
download); if that fails (Gemini's direct-YouTube-URL access has been
returning intermittent `403 PERMISSION_DENIED` for this project — try a
fresh API key from a different Google Cloud project if it persists), it
falls back to a new `transcript-service` sidecar (yt-dlp + Flask, see
`transcript-service/`) that scrapes the video's captions, then feeds the
transcript to Claude. Returns either a Mermaid diagram (rendered inline)
or an ordered checklist (edited inline, downloadable as `.xlsx`/`.pptx`
via `exceljs`/`pptxgenjs`, with a brand-color picker). No approval gate —
the rendered/editable result in the dashboard is itself the review step,
same as the standalone Image Checker tool.

Also tried and abandoned along the way: scraping YouTube's caption-track
URL directly from n8n with no sidecar — worked for a demo once, then
YouTube started returning HTTP 200 with a 0-byte body for every caption
URL tested (confirmed broken independent of this project, even for
videos with real non-auto captions). yt-dlp is needed specifically
because it's actively maintained against these YouTube changes; the
sidecar exists because n8n's official image is now a hardened Alpine
build with no Python/package manager, so yt-dlp can't run inside the n8n
container itself.

Setup: DB migration (`db/migrate-video-templates.sql`), `docker compose
build transcript-service && docker compose up -d transcript-service`,
`npm install` in `dashboard/` (pulls in `mermaid`, `exceljs`,
`pptxgenjs`), and the existing Gemini + Anthropic + Postgres n8n
credentials reattached (no new credential — the sidecar call is
unauthenticated over the internal Docker network). Full setup in
`workflows/video-template-extract.README.md`.

---

## What's running (infrastructure)

`docker compose up -d` from this folder:

| Service    | URL                          | Notes                                                       |
|------------|------------------------------|-------------------------------------------------------------|
| Dashboard  | http://localhost:3000        | React + Vite + react-router (real URLs: `/`, `/blog`, `/social`, `/images`, `/inspiration`, `/guidelines`, `/jobs/:id`, `/guidelines/:id`). |
| n8n        | http://localhost:5678        | Workflow engine. Each workflow needs to be **Active**.      |
| PostgREST  | http://localhost:3001        | REST API over Postgres for the dashboard.                   |
| Postgres   | (internal, 5432)             | DBs: `projectdigital` + `n8n`.                              |
| Appsmith   | http://localhost (port 80)   | **Legacy** — replaced by the React dashboard. Safe to remove. |

External services:
- **Claude API** (Anthropic) — haiku 4.5 for brainstorm + image prompt + meta gen, sonnet 4.6 for outline + draft + caption gen.
- **Gemini Imagen** — image gen via `imagen-4.0-generate-001` (`:predict` endpoint). Key in `.env` as `GEMINI_API_KEY`.
- **Sanity CMS** — project ID `p9audgmp`, dataset `production`. Public site = https://project-digital-website.vercel.app .
- **Metricool** (SaaS) — current scheduling story is **manual copy/paste** from the dashboard's Copy buttons into metricool.com.

DB schema (`db/schema.sql`):
`content_jobs` (incl. `outline` JSONB, `draft_md` TEXT, `chosen_image_id`,
`blog_url`, `shortlink`), `approval_stages`, `platform_captions` (incl.
`metricool_post_id`), **`images`** (unified library — AI + uploads),
**`generated_images`** (legacy — JobDetail / PendingImages still read it,
see Known issues), **`inspiration_items`** (Branch 3), **`guideline_items`**
(Branch 4), **`image_checks`** (standalone pre-send image QC, see below).

---

## What's DONE

**Phase 1 — Infrastructure** ✅

**Stage 1 — Brainstorm + Approval Gate** ✅
- n8n: brainstorm → parse → save job → insert approval → wait → update.
- UI: `dashboard/src/components/PendingBrainstorms.tsx`.

**Stage 2 — Outline + Approval Gate** ✅
- n8n: outline → save → insert approval → wait → advance to `drafting`.
- UI: `PendingOutlines.tsx`.

**Stage 3 — Blog Draft + Approval Gate** ✅
- n8n: draft → save into `draft_md` → insert approval → wait → advance to `image`.
- UI: `PendingDrafts.tsx`.

**Stage 4 — Image Prompt + Generation + Approval Gate** ✅
- n8n: image prompt → Imagen → save → insert approval → wait → advance to `cms`.
- UI: `PendingImages.tsx`.
- Verified: a job reached `cms` with a saved image and approved Stage-4 row.

**Stage 5 — Publish to Sanity CMS** 🟡 (dashboard done; n8n mid-import)
- UI: `PublishPanel.tsx` — collapsible card on the job page with **all**
  Sanity post fields (title from H1, slug auto-from-title with Generate
  button, author free-text, category dropdown, reading time from word
  count, excerpt prefilled from outline meta description, cover image
  thumbnail + alt, meta title + description with char counters and
  "falls back to..." hints). All AI-generatable fields have **Generate**
  buttons calling the `generate-meta` n8n webhook.
- **Pre-publish review modal**: clicking Publish lists any missing
  sections, marks each red (must fix), amber (will be defaulted), or
  gray (Sanity falls back). One click confirms with defaults applied.
- **n8n workflows ready to import** in `workflows/`: `publish-cms.json`,
  `generate-meta.json`. Recipe doc at `publish-cms.README.md`.
- **Not yet confirmed working end-to-end.** Last status: imported, env
  vars are blocked by default in n8n expressions so URLs were hardcoded;
  Sanity credential needs to be reconnected per node; `Upload Cover Image`
  binary-body params depend on the exact n8n version (last error: needs
  `cover` binary which the prior Code node only emits when an image
  exists). First successful publish: pending user test on the franchises
  blog (which has a saved image).

**Repurpose to social** 🟡 (dashboard done; n8n ready to import)
- UI: `PendingCaptions.tsx` (tabbed per-platform editor with char bars,
  hashtag pills, **Copy for Metricool** button per tab), `Repurpose to social`
  button on the job page, `ui/PlatformIcon.tsx`. Covers LinkedIn / X /
  **Meta** (relabeled from "Instagram" 2026-06-01 — underlying enum value
  unchanged).
- `repurpose-social.json` ready in `workflows/` with the recipe in
  `workflows/repurpose-social.README.md`. Not imported / activated yet.

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
  publish-cms.README.md, repurpose-social.README.md, schedule-social.README.md.
- DB column renamed via `db/migrate-metricool.sql` (handles both
  `buffer_post_id` and `postiz_post_id` source states).

---

## What's NEXT

**1. Land the first successful Sanity publish.** Get the franchises blog
   (acdada61) all the way from "Ready to publish" → live on
   `project-digital-website.vercel.app/blog`. Concretely:
   - Fix `Upload Cover Image` binary-body params (n8n version-specific —
     pick `n8n Binary File` for Body Content Type and `cover` as
     Input Data Field Name, see the screenshot guidance in chat).
   - Confirm the Sanity Header Auth credential is selected on both
     Sanity HTTP nodes.
   - Hardcode URLs (`p9audgmp` + `production`) inside the nodes since
     `$env` access is blocked by default in n8n expressions.
   - Click Publish, watch the n8n execution, check Sanity Studio.

**2. Import + activate `generate-meta` and `repurpose-social`.** Both
   JSONs are ready. Activating `generate-meta` unblocks the Excerpt /
   Alt / Meta-title / Meta-description Generate buttons in the publish
   panel. Activating `repurpose-social` makes the Repurpose to social
   button actually work and surfaces captions for review at Stage 5.

**3. Bitly shortlink.** After publish-cms succeeds, add one HTTP node at
   the end that calls Bitly's API with the published blog_url, save the
   result into `content_jobs.shortlink`. ~30 min.

**4. Finish the image-library refactor.** Update `JobDetail` +
   `PendingImages` to read from `images` via `chosen_image_id` instead of
   the legacy `generated_images` embed; update the image-gen node in n8n
   to write into `images`. Then `generated_images` can be retired.

**Phase 3 — native social path.** Topic → social-only flow (no blog).
   Out of scope for now.

**Scheduling via Metricool API** — only worth doing if/when you upgrade
   to Metricool paid. Until then, Copy buttons + manual paste in
   metricool.com is the scheduling layer.

---

## Known issues / cleanup

- ⚠️ **Full n8n workflow (Stages 1–4) still NOT in repo.** Unchanged from
  last update: `workflows/` has only `stage1-brainstorm.json` (stale) +
  `brainstorm-toy.json`. The live workflow runs all the way through image
  gen but lives only inside the n8n container. **Export from n8n
  (··· menu → Download) and commit before the container is ever rebuilt.**
- `generated_images.generated_by` hardcoded to `imagen-3.0-generate-002`
  even though calls use Imagen 4 — fix the literal.
- `PendingImages` AI badge label says "Gemini Imagen 3" — cosmetic.
- **Warm-films job stuck at `image`** — errored before the Imagen-4 fix
  and never re-run. Archive or Debug-in-editor re-run from the Gemini
  node.
- `JobDetail` + `PendingImages` still use legacy `generated_images` — see
  "Image Library" above.
- **`db/migrate-images.sql` may not have been run yet.** Once it is, the
  Image Library page populates from the existing image; until then it
  shows "No images yet."

---

## How to run a topic (the golden path)

1. `docker compose up -d`. If `.env` changed, recreate affected
   container: `docker compose up -d --force-recreate n8n`.
2. In n8n, make sure each workflow you're using is **Active**.
3. http://localhost:3000 → **Start a topic** → click Start.
4. Watch the **Processing** card, then approve at each gate:
   Brainstorm → Outline → Draft → Image.
5. Click the job row (or sidebar Recent) → opens `/jobs/<id>`.
   Stepper + content + Export .docx/.md + **Publish to Sanity CMS** panel.
6. Expand the publish panel, hit **Generate** on Excerpt / Alt /
   Meta title / Meta description (needs `generate-meta` active),
   review, **Publish to Sanity** (needs `publish-cms` active).
7. Hit **Repurpose to social** (needs `repurpose-social` active) →
   review captions at Stage 5 → click **Copy for Metricool** per tab →
   paste into metricool.com → schedule.

---

## Gotchas already solved (don't relearn these)

Auto-memory at `C:\Users\SHERWIN\.claude\projects\d--ProjectDigital-WORKFLOW\memory\`:

- **n8n Wait nodes default to GET.** Set `httpMethod: POST` for JSON-body approvals. (`n8n-wait-node-needs-explicit-post`)
- **Don't use n8n Postgres `executeQuery` + `queryReplacement` for writes.** Use `defineBelow` column mapping. (`n8n-queryreplacement-single-equals`)
- **After importing a workflow JSON via CLI**, reload the n8n tab (F5), re-activate, restart n8n. (`n8n-workflow-import-method`)
- **PostgREST schema cache:** after any DDL, restart postgrest or embeds 404. (`postgrest-schema-cache-reload`)
- **PowerShell ASCII-only scripts** + no `<` stdin redirection. (`powershell-ascii-only-scripts`)
- **Dashboard = React, not Appsmith.** (`react-dashboard-decision`)
- **Content gen uses the Anthropic API key**, not Claude Code. (`use-anthropic-api-not-headless`)

New gotchas (not yet in auto-memory — worth formalizing):
- **Gemini Imagen model name:** use `imagen-4.0-generate-001` (or `-fast-` / `-ultra-`); `imagen-3.0-generate-002` 404s.
- **n8n only reads `.env` at container (re)create.** `docker compose up -d --force-recreate n8n` after key changes; plain restart may not reload.
- **PowerShell `$` in a literal key:** PS expands as a variable and mangles the key. Always use `$key="..."; "...?key=$key"`.
- **n8n env vars (`{{ $env.X }}`) are BLOCKED by default in expressions** for security. Either set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` or hardcode the value in the node. For three non-secret values (project ID, dataset, public URL), hardcoding is simpler.
- **Postiz needs Temporal + Elasticsearch in self-host.** Temporal SQL visibility store has a 3-Text-search-attribute limit; ES sidesteps it. RAM + per-platform OAuth setup made it not worth it for MVP — reverted to Metricool 2026-06-01.

Obsolete (Appsmith-era, kept for history):
- `appsmith-resume-url-host-swap`, `appsmith-json-body-stringified`.

---

## Updating a workflow from repo JSON

```powershell
docker compose cp ./workflows/<file>.json n8n:/tmp/<file>.json
docker compose exec -T n8n n8n import:workflow --input=/tmp/<file>.json
```
Then reload the n8n tab (F5), re-activate, and restart n8n.
