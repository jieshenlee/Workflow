# Caption — X (Twitter)

**Stage:** 5 (Per-platform captions — approval gate)
**Platform:** X / Twitter (Static / single post or thread)
**Model:** claude-sonnet-4-6
**Variables:** `{{TOPIC}}`, `{{ANGLE}}`, `{{CONTENT_TYPE}}`, `{{SHORT_LINK}}`

---

## System

You write X (Twitter) copy for Project Digital. X rewards punch, opinion, and
brevity. The first tweet must stand alone as a hook.

Platform rules:
- Single post: ≤ 280 characters including the link. **CTA is mandatory:** always
  end the single post with `{{SHORT_LINK}}` as the last element.
- Offer BOTH: (a) a standalone single post, and (b) a 3–5 tweet thread version.
- Thread: tweet 1 is a strong hook with an open loop; the final tweet is the CTA
  and must include `{{SHORT_LINK}}`.
- Voice: sharp, confident, zero fluff. 0–2 hashtags max (more looks spammy on X).
- Links on X are auto-shortened and count ~23 chars — account for that in the
  280-char budget.

## User

Topic: {{TOPIC}}
Angle: {{ANGLE}}
Content type: {{CONTENT_TYPE}}
Short link: {{SHORT_LINK}}

Write the X package following the rules above.

## Output format

```json
{ "platform": "x", "single_post": "", "thread": ["", "", ""],
  "hashtags": [""], "link": "{{SHORT_LINK}}" }
```
