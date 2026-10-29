# Workflow recipe — `regenerate-caption`

Regenerates a single platform's caption for an existing job. Called by the
**Regenerate** button in the dashboard's read-only Social posts card. Useful when:
- The original caption was generated before the blog was published (so no shortlink)
- You want a fresh take on one platform without redoing all three

---

## Nodes (in order)

### 1. Webhook — trigger
- Method `POST`, path `regenerate-caption` → `…/webhook/regenerate-caption`
- **Respond:** "Immediately"
- Body: `{ job_id, platform }` — e.g. `{ "job_id": "abc123", "platform": "instagram" }`

### 2. Postgres — Get job (read)
```sql
SELECT id, topic, chosen_angle, draft_md, blog_url, shortlink
FROM content_jobs
WHERE id = '{{ $json.body.job_id }}'
```

### 3. Code — Pick short link
```js
const job = $('Get job').first().json;
// Use stored shortlink if available, otherwise shorten blog_url via TinyURL below.
return [{ json: { ...job, needsShorten: !job.shortlink && !!job.blog_url } }];
```

### 4. IF — needs shorten?
- Condition: `{{ $json.needsShorten }}` is `true`
- **True branch** → node 5 (TinyURL)
- **False branch** → node 6 (Build task), passing `shortlink` or empty string

### 5. HTTP Request — Shorten blog URL (TinyURL) [true branch only]
- **Method:** `GET`
- **URL:** `https://tinyurl.com/api-create.php`
- **Query parameter:** `url` = `{{ $('Get job').first().json.blog_url }}`
- **Response format:** `String` → result in `$json.data`

### 6. Code — Build platform task
```js
const job = $('Get job').first().json;
const platform = $('Webhook').first().json.body.platform;
// shortlink from DB or from TinyURL node, whichever ran
const shortLink = (job.shortlink || $node['Shorten blog URL']?.first()?.json?.data || '').trim();

const SYSTEM = {
  linkedin: `You write LinkedIn copy. 1,300–1,900 chars. First 2 lines are the hook. Short paragraphs, generous line breaks. 3–5 hashtags at the end. Professional but human, 0–3 emoji. CTA mandatory: end body with "Full breakdown → first comment ↓". Return ONLY JSON: {"platform":"linkedin","is_article":false,"hook":"","body":"","hashtags":[""],"char_count":0,"first_comment_link":""}`,
  x: `You write X/Twitter copy. Single post ≤280 chars including link. CTA mandatory: end with the short link. Also give a 3–5 tweet thread (tweet 1 = hook, last = CTA + link). 0–2 hashtags. Return ONLY JSON: {"platform":"x","single_post":"","thread":["",""],"hashtags":[""],"link":""}`,
  instagram: `You write Instagram captions. 125–600 visible chars, hook in line 1, warm + conversational, purposeful emoji. CTA mandatory: include "Full read → link in bio 🔗". End with one engagement prompt. 8–15 hashtags. Return ONLY JSON: {"platform":"instagram","content_type":"static","caption":"","engagement_prompt":"","hashtags":[""],"link_in_bio":"","carousel_slides":[],"reel_onscreen_hook":""}`,
  facebook: `You write Facebook copy. 400–600 chars, conversational opener. CTA mandatory: end with the short link on its own line. 0–2 emoji, 0–3 hashtags. Return ONLY JSON: {"platform":"facebook","body":"","link":"","engagement_prompt":"","hashtags":[]}`,
  threads: `You write Threads copy. ≤500 chars, conversational, invites replies. CTA mandatory: end with the short link. 0–1 hashtags. Return ONLY JSON: {"platform":"threads","post":"","continuation":[],"link":""}`,
  pinterest: `You write Pinterest Pin copy. Pin title ≤100 chars keyword-forward. Description 150–500 chars ending with "Read the full guide →" + short link. 3–6 hashtags. Return ONLY JSON: {"platform":"pinterest","pin_title":"","pin_description":"","destination_url":"","hashtags":[]}`,
  tiktok: `You write TikTok copy. Caption ≤150 chars, punchy. CTA mandatory: end with "full guide → link in bio". Hook ≤8 words. 3–5 beat script outline. Return ONLY JSON: {"platform":"tiktok","onscreen_hook":"","caption":"","hashtags":[],"script_beats":[],"sound_style":"","link_in_bio":""}`,
};

return [{
  json: {
    platform,
    system: SYSTEM[platform] || SYSTEM.instagram,
    user: `Topic: ${job.topic}\nAngle: ${job.chosen_angle || ''}\nContent type: static\nShort link: ${shortLink}\n\nBlog draft:\n${job.draft_md || ''}`,
  },
}];
```

### 7. HTTP Request — Claude
- `POST https://api.anthropic.com/v1/messages`
- Same Anthropic credential as other workflows
- JSON body:
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1500,
  "system": "={{ $json.system }}",
  "messages": [{ "role": "user", "content": "={{ $json.user }}" }]
}
```

### 8. Code — Parse caption JSON
```js
let text = $json.content[0].text.trim();
text = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
return [{
  json: {
    platform: $('Build platform task').first().json.platform,
    captionJson: JSON.parse(text),
    job_id: $('Webhook').first().json.body.job_id,
  },
}];
```

### 9. Postgres — Upsert caption (Execute Query)
```sql
INSERT INTO platform_captions (job_id, platform, content_type, aspect_ratio, caption, status)
VALUES ('{{ $json.job_id }}', '{{ $json.platform }}', 'static', '4:5', '{{ JSON.stringify($json.captionJson) }}', 'pending')
ON CONFLICT (job_id, platform)
DO UPDATE SET caption = EXCLUDED.caption, status = 'pending', updated_at = now()
```
> This requires a UNIQUE constraint on `(job_id, platform)` in `platform_captions`.
> If it doesn't exist yet: `ALTER TABLE platform_captions ADD CONSTRAINT uq_job_platform UNIQUE (job_id, platform);`

---

## After building
1. Activate the workflow.
2. Hit **Regenerate** on any approved caption tab — the DB row resets to `pending`.
3. Refresh the job page after ~10 seconds (the dashboard auto-refreshes).
4. The caption will now show in the edit view at Stage 5 (since status = `pending` again).
