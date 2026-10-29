# Contact Sheet to Post — Handoff

Everything a developer (or a Claude Code session) needs to pick this project up in a new repo and keep building. Written from the actual code as of 2026-10-29; where it disagrees with `PROJECT.md`, **this file wins** (PROJECT.md still describes the abandoned Colab/LoRA design in places).

> **First instruction for any AI agent:** `AGENTS.md` warns this is a newer Next.js (16.3.5) with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code. Also React 19.2, Prisma 6, Zod 4, OpenAI SDK 7.

---

## 1. What it is

Internal Pay&Go tool: turn a short **ask** plus a brand's **reference images** into brand-checked, correctly sized creative assets (post / story / banner).

A **Brand** is shown in the UI as a **Project**. Each project has its own brief text and reference images. No per-brand model training — references are applied live on every job.

## 2. Pipeline (as built)

1. **Draft** — `POST /api/jobs/draft`, synchronous. `gpt-4o-mini` (vision) reads the selected reference images + the ask, drafts a generation prompt, and checks it against the brand brief (`lib/prompt-capture.ts`, `lib/openai.ts`). No job row exists yet.
2. **Edit & queue** — user edits the draft, then `POST /api/jobs` writes a `queued` job (drafted prompt, sizes, the exact reference URLs used).
3. **Render** — `worker/index.ts` polls, claims the oldest queued job (row-locked, safe with multiple replicas), and `worker/generate.ts` renders each size:
   - OpenAI key available → `gpt-image-1` via `images.edit` with the real reference images (pixel-level conditioning), or `images.generate` if there are none (`lib/image-gen.ts`).
   - No key → Pollinations free keyless placeholder (text-to-image only).
4. **Review** — `POST /api/generations/[id]/review` records one of: `approved`, `changes` (edit note → new draft + job; see `lib/regenerate.ts`), `bg_only`, `split`.

Output sizes: post 1080×1080, story 1080×1920, banner 1200×628. `gpt-image-1` only renders 1024², 1024×1536, 1536×1024, so the aspect ratios are approximate (story 2:3 vs 9:16, banner 3:2 vs ~1.91:1) — **no crop/resize step exists yet**.

Spend display assumes $0.03 per generated image (hard-coded in the Spend tab).

## 3. Stack

Next.js 16 App Router (dev port **4000**) · Postgres via Prisma · standalone Node worker run with `tsx` · OpenAI (`gpt-4o-mini` for drafting, `gpt-image-1` for rendering) · Docker Compose for local Postgres (port **5433**). `@aws-sdk/client-s3` is installed for the future R2 storage but unused.

## 4. Run it

```bash
npm install
cp .env.example .env     # set OPENAI_API_KEY (optional) — Prisma only auto-loads .env, not .env.local
npm run db:up            # Postgres in Docker, port 5433
npm run db:migrate       # first run
npm run dev              # http://localhost:4000  -> /projects
npm run worker           # second terminal; without it jobs stay "queued"
```

Without an OpenAI key the app still runs end-to-end: drafting returns a mock draft (the brief check reports the fallback as its one issue) and images come from Pollinations.

### Environment variables

| Var | Status |
|---|---|
| `DATABASE_URL` | Required. Default points at the Docker Postgres. |
| `OPENAI_API_KEY` | Optional. A key saved by a user on `/settings` (stored in `users.openai_api_key`) takes priority over this. |
| `DEFAULT_USER_EMAIL` | Optional. No auth yet; every job is attributed to one seeded user. Defaults to `jieshensherwinlee@gmail.com` in `lib/db-store.ts` — **change this in the new project**. |
| `STORAGE_ACCOUNT_ID`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | Unused until R2 is wired in. |
| `AUTH_SECRET` | Unused until auth exists. |

## 5. Data model (`prisma/schema.prisma`)

- `User` — id, email (unique), name, role (`admin|editor|reviewer`, not enforced anywhere), `openaiApiKey` (plaintext — see risks)
- `Brand` — id, name (unique), brief (text), `referenceUrls` (JSON array; items are http(s) links **or base64 `data:` URLs** for uploaded files)
- `Job` — brandId, userId, `promptRaw` (the ask), `promptDrafted`, `briefCheck` (JSON), `sizes` (JSON), `referenceUrls` (JSON; the exact refs used), `status` (`queued|running|done|failed`). **`jobs.status` is the queue**, no separate table.
- `Generation` — jobId, `size` (`post|story|banner`), `storageKey` (currently just the image URL or data URL), `reviewStatus` (`pending|approved|changes|bg_only|split`), `reviewNotes`

Migrations in `prisma/migrations/` (6, in order: init → brief_check → brands (removes briefs) → job sizes → user openai key → job reference urls). The header comment at the top of `schema.prisma` is stale ("not wired up yet") — it is wired up.

## 6. Code map

```
app/
  page.tsx                      redirects to /projects
  projects/page.tsx             project grid, create project
  projects/[id]/                workspace with 5 tabs
  settings/page.tsx             per-user OpenAI key
  api/brands[/id]               create/list/get/PATCH (brief, reference links)
  api/jobs                      POST queue, GET list (?brandId=)
  api/jobs/draft                synchronous draft + brief check
  api/jobs/[id]                 poll one job
  api/generations/[id]/review   record review decision
  api/settings                  save/read user API key
components/
  AppHeader.tsx
  project/  Sidebar, GenerateTab, GenerationCard, BriefTab, ReferencesTab,
            HistoryTab, SpendTab, JobDetailModal
lib/
  db.ts, db-store.ts            Prisma client + all queries
  openai.ts, prompt-capture.ts  vision draft + brief check (mock fallback)
  image-gen.ts                  SIZES, gpt-image-1 render, Pollinations fallback
  reference-images.ts           fetch/normalize reference URLs for the model
  reference-upload.ts           browser-side file -> data URL (8MB cap)
  regenerate.ts                 "changes requested" loop
  storage.ts                    STUB (R2)
  types.ts, ui-tokens.ts
worker/
  index.ts                      poller / job claiming
  generate.ts                   per-size render loop
  bg-removal.ts                 STUB
Wireframe Scope Planning/       design canvas the UI was built from (Contact Sheet to Post.dc.html)
```

## 7. What's done vs. not

**Done:** multi-brand projects; brief + reference management (links and file upload); synchronous draft + brief check; queue + worker; reference-conditioned `gpt-image-1` rendering; review UI with all four branches *recorded*; job history; spend view; per-user OpenAI key.

**Not done (suggested next work, roughly in priority order):**

1. **Auth** — currently one seeded user, no login. Roles exist in the schema but aren't enforced.
2. **Durable image storage** — `lib/storage.ts` is a stub. Generated images are stored as raw URLs / data URLs in `generations.storage_key`; Pollinations URLs are not permanent and data URLs bloat the DB. Wire in Cloudflare R2 (S3 SDK already installed).
3. **Exact-size output** — add a crop/resize step (e.g. `sharp`) so the files are really 1080×1080 / 1080×1920 / 1200×628.
4. **Background removal** — `worker/bg-removal.ts` stub; the `bg_only` review button only records status.
5. **Separate elements** — re-prompt per element; `split` currently only records status.
6. **Deploy** — Vercel for the app, Render/Fly for the worker, Neon/Supabase for Postgres.
7. **Export** — "approved" marks status but there is no download/publish action.
8. Open question from the original spec: should "changes requested" use structured fields or stay a free-text note (currently free text)?
9. Brand-rule specifics for the brief check still need to come from the real Pay&Go brand guide.

## 8. Known risks / gotchas

- **API keys stored in plaintext** in `users.openai_api_key`. Encrypt or move to a secrets manager before multi-user use.
- **Uploaded references live as base64 in a JSON column** (≤8MB each). Fine for a prototype; move to object storage once R2 exists.
- No auth means every API route is open to anyone who can reach the server.
- Image cost is hard-coded at $0.03 each and doesn't reflect real OpenAI billing.
- `gpt-4o-mini` + `gpt-image-1` need a billed OpenAI account; there is no free tier.
- Local dev port 4000 was chosen to avoid a clash on the original machine; Postgres on 5433 for the same reason.

## 9. Legacy / ignorable

The original design used a per-brand LoRA trained on Google Colab (`colab/*.ipynb`, `lib/colab-client.ts`, `instagram_reference_1/`). It was **abandoned** (Colab sessions aren't servers; cost multiplies per brand). `lib/colab-client.ts`, `lib/brief.ts`, `worker/brief-check.ts` and `app/review/page.tsx` are deleted in the working tree. Don't resurrect it unless you want tighter style lock-in than live references give — and then prefer Replicate/Fal.ai over Colab.

## 10. Moving this to another project

1. Copy the repo (or the folder) **excluding** `node_modules/`, `.next/`, `.env`.
2. Include: `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README.md`, this file, `prisma/`, `docker-compose.yml`, `.env.example`.
3. Optionally drop `Wireframe Scope Planning/` (design reference only, large) and `instagram_reference_1/`.
4. In the new project: `npm install`, set `.env`, change `DEFAULT_USER_EMAIL`, run the commands in section 4.
5. Heads-up: your working tree has many **uncommitted** changes (the multi-brand rewrite, new components, 4 migrations) on top of a single commit. Commit them first, or the copy won't match what you have running.
