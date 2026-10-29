# Workflow recipe — `repurpose-social` (Blog → Social posts)

Build this in the n8n UI, then **export the JSON next to this file** and commit it.

Turns a finished blog job into per-platform social posts (LinkedIn, X, Instagram
for v1), each behind a single human approval gate. The **dashboard UI is already
built** and reads the exact shape below — this workflow is the only missing piece.

---

## URL shortening (free, no account needed)

This workflow shortens `blog_url` via **TinyURL's free API** (node 3 below) before
passing it to Claude. No API key or signup required — just a GET request.

If `publish-cms` already stored a shortlink in `content_jobs.shortlink`, you can
skip node 3 and read that column in node 2 instead:
```sql
SELECT id, topic, chosen_angle, draft_md, blog_url, shortlink
FROM content_jobs WHERE id = '{{ $json.body.job_id }}'
```
Then in the Code node use `job.shortlink || ''` instead of
`$('Shorten blog URL').first().json.data`.

---

## The contract (what the dashboard reads)

- One **`platform_captions`** row per platform: `status='pending'`, `caption` =
  the JSON the platform's prompt returns.
- One **`approval_stages`** row: **`stage_number = 5`**, `status='pending'`,
  `stage_name='captions'`, `resume_url` set.
- On approve, the dashboard PATCHes each caption to `approved` and POSTs the
  `resume_url`. n8n only needs to close the gate — don't overwrite caption status.

> ⚠️ **`stage_number` MUST be `5`.** That is what `PendingCaptions` and the job
> page (`JobDetail` case 5) query on. Wrong number = the editor never appears.

Dashboard pieces already in place: `dashboard/src/components/PendingCaptions.tsx`
(tabbed editor), the **Repurpose to social** button in `JobDetail.tsx`, and the
webhook constant `N8N_REPURPOSE_SOCIAL_URL = …/webhook/repurpose-social`
(`dashboard/src/lib/api.ts`). Caption prompts live in `prompts/caption-*.md`.

---

## Nodes (in order)

### 1. Webhook — trigger
- Method `POST`, path `repurpose-social` → `…/webhook/repurpose-social`.
- **Respond:** "Immediately" (the dashboard button just fires; generation
  continues after the response).
- Body: `{ job_id, platforms: ["linkedin","x","instagram"], content_type: "static" }`.

### 2. Postgres — Get job (read)
```sql
SELECT id, topic, chosen_angle, draft_md, blog_url
FROM content_jobs
WHERE id = '{{ $json.body.job_id }}'
```
(Read-only Execute Query is fine; the executeQuery caveat is only for *writes*.)

### 3. HTTP Request — Shorten blog URL (TinyURL)
- **Method:** `GET`
- **URL:** `https://tinyurl.com/api-create.php`
- **Query parameter:** `url` = `{{ $('Get job').first().json.blog_url }}`
- **Response format:** `String` (TinyURL returns plain text, e.g. `https://tinyurl.com/abc123`)
- Response lands in `$json.data`.

> If `blog_url` is null (blog not published yet), TinyURL will error. Only call
> Repurpose after the blog is published and `blog_url` is set.

### 4. Code — Build per-platform tasks (one item per platform)
```js
const job = $('Get job').first().json;
const platforms = $('Webhook').first().json.body.platforms;
const shortLink = $('Shorten blog URL').first().json.data.trim();

const SYSTEM = {
  linkedin: `You write LinkedIn copy. 1,300–1,900 chars. First 2 lines are the hook. One idea, short paragraphs, generous line breaks. 3–5 hashtags at the very end. Professional but human, 0–3 emoji. CTA is mandatory: do NOT put the link in the post body — LinkedIn suppresses outbound reach. End the body with "Full breakdown → first comment ↓". Return ONLY JSON: {"platform":"linkedin","is_article":false,"hook":"","body":"","hashtags":[""],"char_count":0,"first_comment_link":""}`,
  x: `You write X/Twitter copy. Single post ≤280 chars including link. CTA mandatory: always end single post with the short link. Also give a 3–5 tweet thread: tweet 1 = hook with open loop, last tweet = CTA + short link. Sharp, 0–2 hashtags. Return ONLY JSON: {"platform":"x","single_post":"","thread":["",""],"hashtags":[""],"link":""}`,
  instagram: `You write Instagram captions. 125–600 visible chars, hook in line 1, warm + conversational, purposeful emoji. CTA mandatory: include "Full read → link in bio 🔗" near the end — Instagram has no clickable in-caption links. End with one engagement prompt. 8–15 hashtags (broad + niche). Return ONLY JSON: {"platform":"instagram","content_type":"static","caption":"","engagement_prompt":"","hashtags":[""],"link_in_bio":"","carousel_slides":[],"reel_onscreen_hook":""}`,
};

return platforms.map((p) => ({
  json: {
    platform: p,
    system: SYSTEM[p],
    user: `Topic: ${job.topic}\nAngle: ${job.chosen_angle || ''}\nContent type: static\nShort link: ${shortLink}\n\nBlog draft:\n${job.draft_md || ''}`,
    shortLink,
  },
}));
```
> For full fidelity, paste the entire **## System** section from each
> `prompts/caption-<platform>.md` in place of the condensed strings above.

### 5. HTTP Request — Claude (runs once per item)
- `POST https://api.anthropic.com/v1/messages`
- Auth: same Anthropic credential the brainstorm/outline nodes use
  (`x-api-key` + header `anthropic-version: 2023-06-01`).
- JSON body:
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1500,
  "system": "={{ $json.system }}",
  "messages": [{ "role": "user", "content": "={{ $json.user }}" }]
}
```

### 6. Code — Parse caption JSON
```js
let text = $json.content[0].text.trim();
text = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
return {
  json: {
    platform: $('Build per-platform tasks').item.json.platform,
    captionJson: JSON.parse(text),
  },
};
```

### 7. Postgres — Insert caption (Insert, "Map columns: Define below")
Table `platform_captions`:
| column | value |
|---|---|
| `job_id` | `{{ $('Get job').first().json.id }}` |
| `platform` | `{{ $json.platform }}` |
| `content_type` | `static` |
| `aspect_ratio` | `4:5` |
| `caption` | `{{ JSON.stringify($json.captionJson) }}` (jsonb) |
| `status` | `pending` |

(Use the Insert operation with **Define below** column mapping — not
`executeQuery`+`queryReplacement`; parameter binding is unreliable for writes.)

### 8. Limit — Keep first 1
Collapses the 3 items back to one so the gate/approval nodes run **once**. All 3
inserts in step 7 have already executed before this passes a single item on.

### 9. Postgres — Insert approval gate (Insert, Define below)
Table `approval_stages`:
| column | value |
|---|---|
| `job_id` | `{{ $('Get job').first().json.id }}` |
| `stage_number` | `5` |
| `stage_name` | `captions` |
| `status` | `pending` |
| `resume_url` | `{{ $execution.resumeUrl }}` |
| `content` (optional) | `{{ JSON.stringify({ platforms: $('Webhook').first().json.body.platforms }) }}` |

Set the node to **return the inserted row** so you have its `id` for step 11.

### 10. Wait — approval gate
- Resume: **On Webhook Call**, **HTTP Method = `POST`** ← it defaults to GET;
  must be POST for the JSON-body resume (see `n8n-wait-node-needs-explicit-post`).

### 11. Postgres — Close gate (Update, after Wait resumes)
Table `approval_stages`: `SET status='approved', reviewed_at=now()`
where `id = {{ $('Insert approval gate').first().json.id }}`.
- Do **not** touch `platform_captions` — the dashboard already set them to
  `approved`.
- Job status stays `cms`/`published`; Metricool scheduling is a later stage — manual copy/paste on the free tier, or the n8n workflow at `workflows/schedule-social.README.md` if you're on a paid plan.

---

## After building
1. Activate the workflow (toggle in n8n).
2. If `.env` changed, recreate n8n: `docker compose up -d --force-recreate n8n`.
3. Open a finished blog's job page → **Repurpose to social** → the
   **Social posts awaiting approval** card appears with the 3 platform tabs.
4. **Export the workflow JSON into `workflows/` and commit it.**

## v1 scope (deliberate cuts)
- Text only — no per-platform images yet.
- X thread is read-only in the editor (edit the single post).
- No "regenerate one platform" button.
- Platforms fixed to LinkedIn / X / Instagram (the enum supports all 8).
