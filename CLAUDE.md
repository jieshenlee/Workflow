# Project Digital — Claude Code Context

## What This Project Is

Project Digital is a content automation startup that takes a single topic and produces fully formatted, platform-ready content across a blog and multiple social media channels. The system is human-in-the-loop: at each major stage a human (Jieshen) reviews and approves before the workflow continues. It is **not** a fully autopilot system.

The goal is to automate the mechanical parts (drafting, image generation, resizing, captioning, scheduling) while keeping editorial judgment with the human.

---

## Owner

- **Founder:** Jieshen (jieshensherwinlee@gmail.com)
- **Project name:** Project Digital

---

## Full Workflow

### Branch 1 — Blog Path

```
Topic
  → Brainstorm (Claude API)
    → Topic Research
      → Keyword Research
        → Draft Outline (Claude API)
          → [APPROVAL: Review outline]
            → Draft Blog (Claude API)
              → [APPROVAL: Edit & approve blog draft]
                → Generate Image (OpenAI DALL-E 3 or Gemini Imagen)
                  → [APPROVAL: Approve or regenerate image]
                    → Add to CMS
                      → Publish
                        → Shortlink (Bitly API)
```

### Branch 2 — Social Media Path

```
Topic
  → Brainstorm (Claude API)
    → Social Media
      → Type decision:
          - Meme        → 4:5 aspect ratio
          - Static Post → 4:5 aspect ratio
          - Carousel    → 4:5 aspect ratio
          - Reel        → 9:16 aspect ratio
        → Platform decision:
            - LinkedIn  → Article OR Standard Post
            - Pinterest → Caption + Image → Schedule/Post
            - Instagram → Caption + Image → Schedule/Post
            - Facebook  → Caption + Image → Schedule/Post
            - TikTok    → Schedule/Post
            - YouTube   → Schedule/Post
            - X         → Schedule/Post
            - Threads   → Schedule/Post
          → [APPROVAL: Review captions per platform]
            → Generate Image (if needed)
              → [APPROVAL: Approve image]
                → Schedule / Post on social (Metricool — manual on free tier, API on paid)
```

### Branch 3 — Inspiration Capture (feeds Brainstorm, no approval gate)

Not part of the human-in-the-loop publish pipeline — a side input that
seeds Branch 1/2's Brainstorm step with fresh, trending reference material.
No approval gate; it's a personal swipe file, not published content.

```
Trending photo or video found on IG / TikTok / X / YouTube / web
  → Upload via dashboard (/inspiration) — Telegram-bot capture was the original plan, not built
    → API: POST /api/inspiration-upload
      → Photo: download → Claude Vision tags category + summary
      → Video: download → Gemini analyzes clip directly (no frame extraction/ffmpeg) → tags category + summary
        → Store in `inspiration_items` (category, summary, tags, preview image)
          → Brainstorm stage queries by category for fresh angles
```

Code: `backend/app/routers/tools.py` (`inspiration_upload`).

### Branch 4 — Guidelines Capture (reference library, single approval gate)

A standalone reference/knowledge-base library, not a content-publish
pipeline — has its own single approval gate (category confirmation) rather
than the 6-stage Branch 1/2 approval flow. Independent of `inspiration_items`
(Branch 3): inspiration is a content-idea swipe file, guidelines are
reference/brand/process documents.

```
Find guideline material (PDF, blog post, or screenshot — export PPT to PDF first)
  → Upload via dashboard (/guidelines)
    → API: POST /api/guideline-upload
      → PDF: Claude reads the PDF natively (document content block)
      → Screenshot: Claude Vision reads the image
      → Blog URL: fetch page → strip HTML → Claude reads the text
        → AI suggests category + 2-3 sentence summary + full extracted text
          → Store in `guideline_items` (status: pending_review)
            → [APPROVAL: confirm or edit the AI-suggested category]
              → API: POST /api/guideline-confirm
                → OpenAI TTS narrates the summary
                  → Store audio, status: published
                    → Guideline page at /guidelines/:id (text + audio narration)
```

Code: `backend/app/routers/tools.py` (`guideline_upload`, `guideline_confirm`).

---

## Approval Stages (Human-in-the-Loop)

Every approval stage must pause the workflow and surface content in the React dashboard (`dashboard/`, http://localhost:3000) for review before proceeding. Never auto-advance past an approval gate.

| Stage | What's reviewed | Action |
|---|---|---|
| 1 | Brainstorm / content angle | Edit or approve |
| 2 | Blog outline | Edit or approve |
| 3 | Full blog draft | Edit inline or approve |
| 4 | Generated image | Approve, regenerate, or upload custom |
| 5 | Per-platform captions | Edit each platform's copy individually |
| 6 | Final pre-publish review | Approve to schedule or publish |

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Backend / orchestration | **Python + FastAPI** (`backend/`, self-hosted via Docker) | Replaced n8n 2026-10-29. Every workflow was really Code nodes + raw HTTP calls, so n8n's canvas added export/import/credential overhead without much benefit (workflows lived outside git, env vars blocked in expressions, a Python sidecar just for yt-dlp). Approval gates are DB rows whose `resume_url` points at the API — no paused executions. See `backend/README.md`. |
| Approval dashboard | **React + Vite + Tailwind** (`dashboard/`, self-hosted via Docker) | Hand-rolled; replaced Appsmith 2026-05-26. Low-code archaeology made iteration too painful — see auto-memory `react-dashboard-decision`. |
| Database REST API | **PostgREST** (self-hosted via Docker) | Auto-generates a REST API over Postgres. The React dashboard reads/writes plain table data through this; anything that calls a model or external service goes through the FastAPI backend. |
| AI content generation | **Claude API** (Anthropic) | Blog drafts, outlines, brainstorming, per-platform caption rewrites |
| Image generation | **Google Gemini Imagen 4** (blog hero) + **Gemini 2.5 Flash Image** (Image Maker, Image Gen) | Called from the backend; user approves or regenerates |
| Database | **PostgreSQL** (via Docker) or **Supabase** (cloud free tier) | Stores drafts, approval status, image URLs, platform captions |
| File storage | **Cloudflare R2** or **AWS S3** | Stores generated images and video files |
| URL shortening | **Bitly API** | Free tier covers basic usage |
| Social scheduling | **Metricool** (SaaS) | Free tier covers Facebook, Instagram, Threads, TikTok, YouTube, Pinterest — dashboard generates captions, you copy them into Metricool's UI. Paid plans ($18/mo+) unlock REST API access so the backend can schedule directly. Switched back from Postiz 2026-06-01 — self-host scheduler was too much infrastructure (Temporal + Elasticsearch + per-platform OAuth dev apps) for MVP-stage scheduling needs. |
| Inspiration capture | **Telegram Bot API** | Zero-friction mobile capture — most social apps support native "Share → Telegram." Single bot/webhook ingests both photos and videos for Branch 3 (see above), avoiding fragile per-platform scrapers. |
| Guideline narration | **OpenAI TTS** (`tts-1`) | Narrates the AI-generated summary of each confirmed guideline for Branch 4 (see above). Reuses the existing `OPENAI_API_KEY` — no new key needed. |
| Containerisation | **Docker Desktop** | Runs Postgres + API + PostgREST + dashboard locally with one command (`docker compose up -d`) |
| Version control | **Git + GitHub** | Track workflow configs and dashboard code |

---

## Project Folder Structure

```
ProjectDigital/
├── CLAUDE.md                  ← this file — read at start of every session
├── README.md
├── .env                       ← real keys — never commit this
├── .env.example               ← template with comments — commit this
├── .gitignore
├── docker-compose.yml         ← spins up Postgres + API + PostgREST + dashboard
│
├── docs/
│   ├── workflow-blog-path.png
│   ├── workflow-social-path.png
│   └── tech-stack.md
│
├── backend/                   ← Python (FastAPI) API — AI steps, approval gates, integrations
│   ├── app/                   ← main.py, pipeline.py, prompts.py, routers/
│   └── tests/                 ← pytest (real Postgres, faked external APIs)
│
├── dashboard/                 ← React + Vite approval dashboard
│
├── db/                        ← schema.sql + one-off migrate-*.sql
│
├── legacy/n8n/                ← archived n8n workflows (no longer run)
│
├── scripts/                   ← utility scripts (e.g. resize images, test APIs)
│   └── test-apis.sh
│
└── prompts/                   ← Claude API prompt templates
    ├── brainstorm.md
    ├── blog-outline.md
    ├── blog-draft.md
    ├── caption-linkedin.md
    ├── caption-instagram.md
    ├── caption-tiktok.md
    ├── caption-pinterest.md
    ├── caption-facebook.md
    ├── caption-x.md
    └── caption-threads.md
```

---

## Build Order (Follow This Sequence)

Build the Blog Path first — it's linear, easier to test end-to-end, and proves the approval loop works before adding the complexity of multi-platform social routing.

**Phase 1 — Infrastructure**
- [ ] Docker Compose up (Postgres + API + PostgREST + dashboard)
- [ ] Environment variables configured
- [ ] APIs tested (Claude, OpenAI, Bitly)

**Phase 2 — Blog Path**
- [ ] Backend pipeline: Topic → Brainstorm → Outline → Draft → Image → CMS → Publish → Shortlink
- [ ] Dashboard approval pages for each stage
- [ ] Postgres schema: `content_jobs`, `approval_stages`, `platform_captions`

**Phase 3 — Social Path**
- [ ] Backend: Type routing (Meme/Static/Carousel/Reel)
- [ ] Platform routing (LinkedIn/Pinterest/Instagram/Facebook/TikTok/YouTube/X/Threads)
- [ ] Caption generation prompts per platform
- [ ] Metricool integration for scheduling (manual paste on free; API workflow on paid)
- [ ] Aspect ratio handling (4:5 and 9:16)

**Phase 4 — Polish**
- [ ] Image resize automation per platform
- [ ] Bulk scheduling interface
- [ ] Analytics / tracking of published content

---

## API Keys Required

See `.env.example` for full list. Key ones:
- `ANTHROPIC_API_KEY` — get from console.anthropic.com
- `OPENAI_API_KEY` — get from platform.openai.com
- `GEMINI_API_KEY` — get from aistudio.google.com (alternative image gen)
- `BITLY_ACCESS_TOKEN` — get from dev.bitly.com
- `METRICOOL_USER_TOKEN` + `METRICOOL_BRAND_ID` — only needed on a paid Metricool plan; generate the token from metricool.com → Settings → API
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` — from supabase.com dashboard

---

## Working Rules for Claude Code

- **Read `STATUS.md` at the start of every session.** It tracks current progress, what's working, and what to build next. Keep it updated as work lands.
- **Always follow the build order above.** Don't jump ahead to social path until blog path is tested.
- **Never publish content without an approval gate.** Every workflow must pause at each approval stage.
- **Prompts:** `/prompts/*.md` hold the prompt templates; the backend can load them with `prompts.load_section()` (Image Gen does). The blog/social/tool system prompts that were live in n8n were ported verbatim into `backend/app/prompts.py` — keep new system prompts in one of those two places rather than scattered through route code.
- **All backend logic is Python in `backend/`.** Add a feature as a route in `backend/app/routers/`, with a test in `backend/tests/` (real Postgres, external APIs faked). Run `pytest` before committing. Approval gates go through `pipeline.open_gate()` — never advance a job without one.
- **Never commit `.env`.** Only `.env.example` gets committed.
- **Content types and aspect ratios:**
  - Meme, Static Post, Carousel → 4:5
  - Reel → 9:16
  - LinkedIn Article → long form, different from Standard Post
- **Per-platform captions must be written separately.** Do not reuse the same copy across platforms — tone and length differ significantly (LinkedIn ≠ TikTok ≠ Pinterest).
- **Estimated running cost:** ~$15–40/month at solo founder scale. Optimise for free tiers where possible.

---

## Context From Initial Planning (Cowork Session — May 2026)

- Workflow was designed from two hand-drawn diagrams, then a digital diagram
- Originally chose Appsmith over Retool for free + open-source. Switched to a React dashboard 2026-05-26 — Appsmith's low-code model required too much archaeology per new feature, and that was already biting at Stage 2.
- Chose n8n over Make because n8n is open-source, self-hostable, and has direct Claude API integration via HTTP nodes. Switched n8n → Python/FastAPI 2026-10-29: the workflows had become Code nodes + raw HTTP calls, and the n8n overhead (manual JSON export, credential reattaching, blocked env vars, a Python sidecar for yt-dlp) outweighed the visual canvas. Old workflows in `legacy/n8n/`.
- Backbone now: FastAPI backend + React dashboard + PostgREST + Postgres
- Human approval at every major stage is a hard requirement, not optional
