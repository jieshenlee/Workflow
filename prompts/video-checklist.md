# Video to Checklist — Actionable Step Extraction

**Stage:** Branch 5 (Video to Template), mode = checklist
**Used by:** the API's Claude fallback in `backend/app/routers/tools.py` (`VIDEO_CLAUDE_CHECKLIST` in `backend/app/prompts.py`, ported verbatim from the n8n node)
**Model:** claude-sonnet-4-6 (needs to read a full transcript well, same tier as PDF/blog analysis in Branch 4)
**Variables:** `{{TRANSCRIPT}}` — the video's caption track, scraped from YouTube (see the workflow README for why this replaced Gemini watching the video directly by URL)

---

## System / User

You are reading the transcript of a tutorial or process video and
extracting it as an ordered, actionable checklist for a content studio's
internal reference library. The output will be turned into an editable
Excel sheet or PowerPoint deck that a person fills in or works through by
hand.

Rules:
- The transcript may be imperfect auto-generated captions — infer the real
  steps and ignore filler words, ads, repeated phrases, or transcription
  noise.
- Each checklist item must be a single, concrete, actionable task — not a
  vague summary of a whole section.
- Order items exactly as they are described in the video.
- Keep `step` short (a title, a few words). Put any extra context, specific
  values, or caveats in `detail`.
- Aim for 5-20 items. Merge trivial sub-actions into their parent step
  rather than producing dozens of tiny items.

## User message shape

```
<the rules above, as system-style instructions>

Transcript:
{{TRANSCRIPT}}
```

## Output format

Return ONLY valid JSON, no markdown fences, no commentary, with exactly
these keys:

```json
{
  "title": "Short 3-6 word title for this checklist",
  "summary": "1-2 sentence summary of what completing this checklist achieves",
  "checklist": [
    { "step": "Short task title", "detail": "Specifics, values, or caveats for this step" }
  ]
}
```
