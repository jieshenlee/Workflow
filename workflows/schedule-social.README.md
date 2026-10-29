# Workflow recipe — `schedule-social` (captions → Metricool)

The last step of the social path. Pushes the per-platform captions Claude
generated into your Metricool brand so they go out on schedule.

---

## ⚠️ Free vs paid Metricool — read this first

Metricool's REST API requires a **paid plan** (Starter ~$18/mo and up).
Free-tier accounts can connect channels and schedule posts inside Metricool's
UI, but cannot use the API.

- **On free tier (default for v1):** ignore this whole file. Open a job's
  page in the dashboard, expand the **Social posts** tabs, copy each
  platform's caption + hashtags, paste into Metricool's UI manually,
  schedule, done. Slightly tedious for ~6 platforms but works perfectly fine
  at low volume.

- **On a paid Metricool plan:** wire the workflow below. n8n calls Metricool's
  API once per approved caption, the post id comes back, we save it on the
  `platform_captions` row.

---

## Prereqs (paid plan path only)

1. In Metricool: **Settings → API → Generate User Token**. Copy the token.
2. Open your brand in metricool.com; the URL contains the **Brand ID** (a
   number). Note it.
3. Drop both into `.env`:
   ```
   METRICOOL_API_URL=https://app.metricool.com/api
   METRICOOL_USER_TOKEN=<your token>
   METRICOOL_BRAND_ID=<your brand id>
   ```
4. `docker compose up -d --force-recreate n8n` so n8n picks up the new env vars.
5. In n8n, create an **HTTP Header Auth** credential named
   **`Metricool Header Auth`**:
   - Header name: `X-Mc-Auth`
   - Value: `${METRICOOL_USER_TOKEN}`

---

## The contract

The dashboard's stage-5 caption approval already does its part — every row in
`platform_captions` for the job has `status='approved'`. This workflow takes it
from there:

1. Webhook `POST /webhook/schedule-social` with `{ job_id, scheduled_at? }`.
2. Loads the job's `platform_captions` where `status='approved'` AND
   `metricool_post_id IS NULL` (so re-runs don't double-post).
3. For each row, POSTs the caption to Metricool's API for that brand + network.
4. Stores the returned Metricool post id on the row + sets `scheduled_at`.

---

## Nodes (in order)

### 1. Webhook
- Method `POST`, path `schedule-social`.
- Respond: **Immediately** (scheduling is async; dashboard fires and forgets).
- Body: `{ job_id, scheduled_at?: ISO string }`.

### 2. Postgres — Get approved captions
```sql
SELECT pc.id, pc.platform, pc.caption, pc.image_url
FROM platform_captions pc
WHERE pc.job_id = '{{ $json.body.job_id }}'
  AND pc.status = 'approved'
  AND pc.metricool_post_id IS NULL
ORDER BY pc.platform
```

Returns N items, one per platform that hasn't been scheduled yet.

### 3. Code — Build Metricool payload (runs once per item)

Maps each platform's JSON caption to Metricool's post shape:

```js
const c = $json
const cap = c.caption || {}

// Pull the primary text per platform (matches the dashboard's mapping).
let text = ''
if (c.platform === 'linkedin') text = cap.body || ''
else if (c.platform === 'x') text = cap.single_post || ''
else if (c.platform === 'instagram') text = cap.caption || ''
else text = cap.body || cap.caption || cap.single_post || ''

const hashtags = Array.isArray(cap.hashtags) ? cap.hashtags : []
if (hashtags.length) text += '\n\n' + hashtags.map(t => '#' + String(t).replace(/^#/, '')).join(' ')

// Metricool calls platforms "networks"; map our enum.
const METRICOOL_NETWORK = {
  linkedin: 'linkedin',
  x: 'twitter',
  instagram: 'instagram',
  facebook: 'facebook',
  threads: 'threads',
  tiktok: 'tiktok',
  youtube: 'youtube',
  pinterest: 'pinterest',
}

const scheduledAt = $('Webhook').first().json.body.scheduled_at || new Date(Date.now() + 5 * 60 * 1000).toISOString()

return [{
  json: {
    caption_id: c.id,
    payload: {
      text,
      providers: [{ network: METRICOOL_NETWORK[c.platform] }],
      publicationDate: { dateTime: scheduledAt, timezone: 'Asia/Singapore' },
      media: c.image_url ? [{ url: c.image_url }] : [],
    },
  },
}]
```

### 4. HTTP Request — Submit to Metricool
- Method `POST`
- URL: `={{ $env.METRICOOL_API_URL }}/v2/scheduler/posts?blogId={{ $env.METRICOOL_BRAND_ID }}`
- Authentication: Generic → Header Auth → **Metricool Header Auth**
- Body Content Type: JSON
- JSON body: `={{ JSON.stringify($json.payload) }}`

Metricool's response includes the created post's `id` — confirm the field name
in the Metricool API docs for your plan; older endpoints returned `postId`,
newer ones return `id`.

### 5. Postgres — Save the Metricool post id

Update operation, table `platform_captions`, **Define below**:

| column | value |
|---|---|
| `id` (matching column) | `={{ $('Code — Build Metricool payload').first().json.caption_id }}` |
| `metricool_post_id` | `={{ $json.id || $json.postId }}` |
| `scheduled_at` | `={{ $json.publicationDate?.dateTime || new Date().toISOString() }}` |

---

## Open / later

- **Bitly shortlink injection** — if `content_jobs.shortlink` exists, append it
  to the post text (especially for X where the 280-char limit matters).
- **Aspect-ratio image variants** — assumes one image per caption. 4:5 vs 9:16
  variants happen upstream by whichever image-resize step we add.
- **Posted-at webhook back from Metricool** — flip `posted_at` once each post
  actually goes live. Metricool supports webhooks on some endpoints.
- **Verify exact API URL / field names** against Metricool's current docs
  before activating. Their API has evolved; what's here is the standard v2
  shape but small differences (field name, scheduling object) are likely per
  plan tier.
