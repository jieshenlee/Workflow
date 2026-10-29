# Project Digital

Single topic in → platform-ready content out, across a blog and 8 social channels.
**Human-in-the-loop**: every major stage pauses for review before continuing. Not autopilot.

See [`CLAUDE.md`](./CLAUDE.md) for the full workflow, approval gates, and design rationale.

---

## Stack

| Layer | Tool | Local URL |
|---|---|---|
| Orchestration | n8n | http://localhost:5678 |
| Approval dashboard | Appsmith | http://localhost |
| Database | PostgreSQL 15 | localhost:5432 |
| Content gen | Claude API | — |
| Image gen | OpenAI DALL·E 3 / Gemini Imagen | — |
| Shortlinks | Bitly | — |
| Social scheduling | Metricool (SaaS) | metricool.com |

---

## Getting started

### 1. Configure environment

```powershell
Copy-Item .env.example .env
# then edit .env and fill in your keys + a strong POSTGRES_PASSWORD / N8N_PASSWORD
```

### 2. Bring up the stack

```powershell
docker compose up -d
```

Postgres auto-applies [`db/schema.sql`](./db/schema.sql) on first boot (empty volume only).
n8n → http://localhost:5678 · Appsmith → http://localhost

### 3. Test API connectivity

```powershell
./scripts/test-apis.ps1      # Windows
# ./scripts/test-apis.sh     # Linux / macOS / WSL (needs curl + jq)
```

Reports `OK` / `FAIL` / `SKIPPED` per API. Keys that aren't set are skipped, so you
can validate Claude/OpenAI/Bitly now and add Metricool (paid tier only) in Phase 3.

---

## Repository layout

```
WORKFLOW/
├── CLAUDE.md            project context — read first
├── README.md           this file
├── docker-compose.yml  n8n + Appsmith + Postgres
├── .env.example        env template (copy to .env)
├── db/
│   └── schema.sql      content_jobs · approval_stages · platform_captions
├── prompts/            Claude API templates ({{VARIABLES}})
│   ├── brainstorm.md · blog-outline.md · blog-draft.md
│   └── caption-{linkedin,instagram,tiktok,pinterest,facebook,x,threads}.md
├── scripts/
│   └── test-apis.{ps1,sh}
└── workflows/          n8n JSON exports (built in the n8n UI — see below)
```

---

## Data model

- **`content_jobs`** — one row per topic. Tracks branch (`blog`/`social`), `status`,
  chosen angle, keywords, URLs; evolving artifacts (brainstorm/outline/draft) live in
  the `data` jsonb column.
- **`approval_stages`** — audit trail of every gate. n8n inserts a `pending` row and
  pauses; the dashboard flips it to `approved`/`edited`; a webhook resumes the run.
- **`platform_captions`** — per-platform social copy (one row per job × platform),
  with aspect ratio, Metricool post id (when scheduled via API), and schedule time.

---

## Approval gates (never auto-advance)

| # | Reviewed | Action |
|---|---|---|
| 1 | Brainstorm / angle | Edit or approve |
| 2 | Blog outline | Edit or approve |
| 3 | Full blog draft | Edit inline or approve |
| 4 | Generated image | Approve / regenerate / upload |
| 5 | Per-platform captions | Edit each platform individually |
| 6 | Final pre-publish | Approve to schedule/publish |

---

## Build status

- [x] **Phase 1 — Infrastructure**: docker-compose, env template, DB schema, API test script
- [ ] **Phase 2 — Blog Path**: n8n workflow + Appsmith approval pages (next)
- [ ] **Phase 3 — Social Path**: type/platform routing, Metricool scheduling (manual on free, API on paid), aspect ratios
- [ ] **Phase 4 — Polish**: image resize, bulk scheduling, analytics

### Next step — Phase 2 blog workflow

The n8n workflow and Appsmith pages are built in their respective UIs (hand-editing
n8n JSON by hand is error-prone), then exported:
1. Build `Topic → Brainstorm → Outline → [gate] → Draft → [gate] → Image → [gate] → CMS → Publish → Bitly` in n8n, wiring each Claude node to a `prompts/*.md` template.
2. Build the Appsmith approval pages against the three tables above.
3. Export the workflow to `workflows/blog-path.json` and commit it.

---

## Notes / open items

- **No `caption-youtube.md` yet.** The social path lists YouTube, but CLAUDE.md's
  `prompts/` manifest omits a YouTube template. Add one when the YouTube flow is built.
- **`.env` is gitignored** — only `.env.example` is committed. Never commit real keys.
- **Cost target:** ~$15–40/month at solo-founder scale; prefer free tiers.
