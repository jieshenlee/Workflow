# Workflow — `publish-cms` + `generate-meta`

Two importable n8n workflows that finish the blog publishing loop. The dashboard
already POSTs to both webhooks; until they're active + configured, the buttons
error gracefully.

## TL;DR — what to do

1. Add **three env vars** to `.env` (or n8n env):
   ```
   SANITY_PROJECT_ID=<your project id, e.g. abc123de>
   SANITY_DATASET=<your dataset, e.g. production>
   SITE_URL=https://yoursite.com
   ```
2. In n8n → Credentials → New → **HTTP Header Auth**, name it `Sanity Header Auth`,
   set header `Authorization` = `Bearer <your sanity write token>`.
3. Import both workflows:
   ```powershell
   docker compose cp ./workflows/publish-cms.json n8n:/tmp/publish-cms.json
   docker compose cp ./workflows/generate-meta.json n8n:/tmp/generate-meta.json
   docker compose exec -T n8n n8n import:workflow --input=/tmp/publish-cms.json
   docker compose exec -T n8n n8n import:workflow --input=/tmp/generate-meta.json
   docker compose up -d --force-recreate n8n
   ```
4. In each workflow, **open the HTTP nodes** that say `Sanity Header Auth` and
   re-pick your credential (the import uses a placeholder ID — node shows
   "credential not found" until you reselect).
5. **Activate** both workflows (toggle top-right).
6. Smoke-test the webhooks:
   ```powershell
   curl.exe -s -o NUL -w "%{http_code}`n" -X POST -H "Content-Type: application/json" -d "{}" http://localhost:5678/webhook/generate-meta
   curl.exe -s -o NUL -w "%{http_code}`n" -X POST -H "Content-Type: application/json" -d "{}" http://localhost:5678/webhook/publish-cms
   ```
   Both should return 200/500 (not 404).

---

## `generate-meta` — what it does

Synchronous webhook that fills one CMS field at a time. Used by the four
**Generate** buttons in the Publish panel (Excerpt, Alt, Meta title, Meta description).

- Webhook `POST /webhook/generate-meta` with `{ job_id, field }` where
  `field ∈ { excerpt, alt, meta_title, meta_description }`.
- Loads the job, runs Claude haiku 4.5 with a per-field prompt + length target.
- **Responds synchronously** with `{ [field]: "<generated text>" }` — the
  dashboard slots it straight into the form input.

No env vars or extra credentials needed beyond the existing Anthropic + Postgres
ones. Just import + activate.

---

## `publish-cms` — what it does

Fire-and-forget webhook that pushes a finished blog into Sanity.

Flow:
1. Webhook `POST /webhook/publish-cms` with `{ job_id, title, slug, author, category, reading_time, excerpt, cover_alt, meta_title, meta_description }` (the dashboard sends all of these from the form).
2. Loads the job's draft + the cover image (from the new `images` table via
   `chosen_image_id`, falling back to `generated_images.is_chosen` for backward compat).
3. **Markdown → Portable Text** (Code node, handles H1–H4, paragraphs, bullet + numbered lists; inline bold/italic/links are skipped in v1).
4. **Uploads the cover image** to Sanity assets, gets back an asset `_id`.
5. **Submits the post mutation** to Sanity:
   - `createIfNotExists` for the author (`_id: 'author-<slug>'`) and category (`_id: 'category-<slug>'`) — idempotent, so re-publishing is safe.
   - `create` the `post` document with all fields + a `coverImage` reference + `body` as Portable Text + a fresh `publishedAt`.
6. **Updates `content_jobs`** → `status = 'published'`, `blog_url = $SITE_URL/blog/<slug>`.

---

## Assumed Sanity schema

The mutation uses these document types and field names (Sanity's camelCase
convention). If your schema differs, edit the `Build Mutations` Code node:

**Post:**
- `title` (string)
- `slug` (slug — `{ current: "..." }`)
- `author` (reference → `author`)
- `category` (reference → `category`)
- `readingTime` (number)
- `excerpt` (text)
- `coverImage` (image — `{ asset: { _ref }, alt }`)
- `body` (Portable Text — array of blocks)
- `metaTitle` (string)
- `metaDescription` (string)
- `publishedAt` (datetime)

**Author:** `_id: 'author-<slug>'`, `name`
**Category:** `_id: 'category-<slug>'`, `title`

---

## Caveats / known limits

- **Couldn't test these.** I wrote them blind against your existing workflow's
  node conventions. Most likely things to need a tweak in the n8n UI on first
  run: the `Upload Cover Image` HTTP node's binary-body params (the spec
  changes between n8n versions), and the credential ID placeholder.
- **Portable Text converter is minimal** — block-level only. If your drafts use
  bold/italic/links in paragraphs, those will flatten to plain text. Bumping
  this up is a Code-node-only change; tell me if you want it.
- **Author/Category resolve by slugified name.** If the same name maps to a
  different intended document, the `createIfNotExists` won't help. Worst case:
  manually link in Sanity Studio after publish.
- The dashboard's category dropdown still shows placeholder values. Replace
  the list in `dashboard/src/components/PublishPanel.tsx` (top of file) with
  your real Sanity categories.

---

## After this is live

Remaining pipeline holes once both workflows are in:
- **Bitly shortlink** — wire after publish (`content_jobs.shortlink` column exists).
- **Metricool scheduling** for social posts (after captions are approved). On free tier this is manual copy/paste from the dashboard's caption tabs into metricool.com. On a paid Metricool plan the n8n `schedule-social` workflow can push directly via API — see `workflows/schedule-social.README.md`.
- The whole **Social Path Phase 3** (native social jobs from a topic).
