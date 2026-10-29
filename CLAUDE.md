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
  → Share / forward → Telegram bot
    → n8n: Telegram Trigger
      → Photo: download → Claude Vision tags category + summary
      → Video: download → Gemini analyzes clip directly (no frame extraction/ffmpeg) → tags category + summary
        → Store in `inspiration_items` (category, summary, tags, preview image)
          → Brainstorm stage queries by category for fresh angles
```

Workflow: `workflows/inspiration-capture.json` — see
`workflows/inspiration-capture.README.md` for setup.

### Branch 4 — Guidelines Capture (reference library, single approval gate)

A standalone reference/knowledge-base library, not a content-publish
pipeline — has its own single approval gate (category confirmation) rather
than the 6-stage Branch 1/2 approval flow. Independent of `inspiration_items`
(Branch 3): inspiration is a content-idea swipe file, guidelines are
reference/brand/process documents.

```
Find guideline material (PDF, blog post, or screenshot — export PPT to PDF first)
  → Upload via dashboard (/guidelines)
    → n8n: guideline-upload webhook
      → PDF: Claude reads the PDF natively (document content block)
      → Screenshot: Claude Vision reads the image
      → Blog URL: fetch page → strip HTML → Claude reads the text
        → AI suggests category + 2-3 sentence summary + full extracted text
          → Store in `guideline_items` (status: pending_review)
            → [APPROVAL: confirm or edit the AI-suggested category]
              → n8n: guideline-confirm webhook
                → OpenAI TTS narrates the summary
                  → Store audio, status: published
                    → Guideline page at /guidelines/:id (text + audio narration)
```

Workflow: `workflows/guidelines-capture.json` — see
`workflows/guidelines-capture.README.md` for setup.

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
| Workflow orchestration | **n8n** (self-hosted via Docker) | Open source, visual canvas, webhook-based approval pausing, free |
| Approval dashboard | **React + Vite + Tailwind** (`dashboard/`, self-hosted via Docker) | Hand-rolled; replaced Appsmith 2026-05-26. Low-code archaeology made iteration too painful — see auto-memory `react-dashboard-decision`. |
| Database REST API | **PostgREST** (self-hosted via Docker) | Auto-generates a REST API over Postgres. The React dashboard reads/writes through this; no hand-rolled backend. |
| AI content generation | **Claude API** (Anthropic) | Blog drafts, outlines, brainstorming, per-platform caption rewrites |
| Image generation | **OpenAI DALL-E 3** or **Google Gemini Imagen** | Called from Appsmith dashboard; user can regenerate |
| Database | **PostgreSQL** (via Docker) or **Supabase** (cloud free tier) | Stores drafts, approval status, image URLs, platform captions |
| File storage | **Cloudflare R2** or **AWS S3** | Stores generated images and video files |
| URL shortening | **Bitly API** | Free tier covers basic usage |
| Social scheduling | **Metricool** (SaaS) | Free tier covers Facebook, Instagram, Threads, TikTok, YouTube, Pinterest — dashboard generates captions, you copy them into Metricool's UI. Paid plans ($18/mo+) unlock REST API access so n8n can schedule directly. Switched back from Postiz 2026-06-01 — self-host scheduler was too much infrastructure (Temporal + Elasticsearch + per-platform OAuth dev apps) for MVP-stage scheduling needs. |
| Inspiration capture | **Telegram Bot API** | Zero-friction mobile capture — most social apps support native "Share → Telegram." Single bot/webhook ingests both photos and videos for Branch 3 (see above), avoiding fragile per-platform scrapers. |
| Guideline narration | **OpenAI TTS** (`tts-1`) | Narrates the AI-generated summary of each confirmed guideline for Branch 4 (see above). Reuses the existing `OPENAI_API_KEY` — no new key needed. |
| Containerisation | **Docker Desktop** | Runs n8n + Appsmith + Postgres locally with one command |
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
├── docker-compose.yml         ← spins up n8n + Appsmith + Postgres
│
├── docs/
│   ├── workflow-blog-path.png
│   ├── workflow-social-path.png
│   └── tech-stack.md
│
├── workflows/                 ← n8n workflow JSON exports
│   ├── blog-path.json
│   └── social-path.json
│
├── dashboard/                 ← Appsmith pages / custom dashboard code
│   ├── approval-stages/
│   └── image-gen/
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
- [ ] Docker Compose up (n8n + Appsmith + Postgres)
- [ ] Environment variables configured
- [ ] APIs tested (Claude, OpenAI, Bitly)

**Phase 2 — Blog Path**
- [ ] n8n workflow: Topic → Brainstorm → Outline → Draft → Image → CMS → Publish → Bitly
- [ ] Appsmith approval pages for each stage
- [ ] Postgres schema: `content_jobs`, `approval_stages`, `platform_captions`

**Phase 3 — Social Path**
- [ ] n8n workflow: Type routing (Meme/Static/Carousel/Reel)
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
- **Prompt templates live in `/prompts/`.** When writing Claude API calls, reference these files rather than hardcoding prompts inline.
- **n8n workflows are exported as JSON to `/workflows/`.** After any change to a workflow in the n8n UI, export and commit the JSON.
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
- Chose n8n over Make because n8n is open-source, self-hostable, and has direct Claude API integration via HTTP nodes
- Use n8n + React + PostgREST as the backbone; build custom only where needed
- Human approval at every major stage is a hard requirement, not optional
