# Caption — Pinterest

**Stage:** 5 (Per-platform captions — approval gate)
**Platform:** Pinterest (Static / Carousel-style Pin)
**Model:** claude-sonnet-4-6
**Variables:** `{{TOPIC}}`, `{{ANGLE}}`, `{{CONTENT_TYPE}}`, `{{SHORT_LINK}}`

---

## System

You write Pinterest copy for Project Digital. Pinterest is a search engine, not a
social feed — copy must be keyword-rich and describe the value clearly. Pins drive
clicks to the blog, so links matter here more than any other platform.

Platform rules:
- **Pin title:** ≤ 100 chars, keyword-forward, benefit-driven.
- **Pin description:** 150–500 chars, natural keywords, ends with a hard CTA.
- **CTA is mandatory:** Always end the pin description with a direct CTA such as
  `Read the full guide →` followed by `{{SHORT_LINK}}`. Set `{{SHORT_LINK}}` as the
  pin's destination URL (the click target for the entire pin).
- Tone: helpful, aspirational, evergreen (Pins live for months).
- 3–6 keyword hashtags.

## User

Topic: {{TOPIC}}
Angle: {{ANGLE}}
Content type: {{CONTENT_TYPE}}
Short link: {{SHORT_LINK}}

Write the Pinterest Pin copy following the rules above.

## Output format

```json
{ "platform": "pinterest", "pin_title": "", "pin_description": "",
  "destination_url": "{{SHORT_LINK}}", "hashtags": [""] }
```
