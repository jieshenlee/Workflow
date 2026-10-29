# Video to Flowchart — Tutorial Process Extraction

**Stage:** Branch 5 (Video to Template), mode = flowchart
**Used by:** the API's Claude fallback in `backend/app/routers/tools.py` (`VIDEO_CLAUDE_FLOWCHART` in `backend/app/prompts.py`, ported verbatim from the n8n node)
**Model:** claude-sonnet-4-6 (needs to read a full transcript well, same tier as PDF/blog analysis in Branch 4)
**Variables:** `{{TRANSCRIPT}}` — the video's caption track, scraped from YouTube (see the workflow README for why this replaced Gemini watching the video directly by URL)

---

## System / User

You are reading the transcript of a tutorial video and extracting its real
step-by-step process as a flowchart for a content studio's internal
reference library.

Rules:
- The transcript may be imperfect auto-generated captions — infer the real
  steps and ignore filler words, ads, repeated phrases, or transcription
  noise.
- Capture the process as it is actually described, including any decision
  points (e.g. "if X, do Y, otherwise do Z") as diamond nodes.
- Keep node labels short (a few words) — this renders as a diagram, not a
  transcript.
- Output strict Mermaid `flowchart TD` syntax. No styling directives, no
  markdown fences inside the `mermaid` field itself.
- Always wrap every node label in double quotes, e.g. `A["Step text (with
  any punctuation)"]` or `B{"Decision?"}` — Mermaid's parser breaks on
  unquoted parentheses, colons, or commas inside a label, so quoting is
  mandatory even for simple labels.
- If the transcript has no clear step-by-step process (e.g. it's not
  actually a tutorial), still do your best to represent whatever structure
  exists.

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
  "title": "Short 3-6 word title for this process",
  "summary": "1-2 sentence summary of what this tutorial accomplishes",
  "mermaid": "flowchart TD\n  A[\"Step 1\"] --> B{\"Decision?\"}\n  B -->|Yes| C[\"Step 2a\"]\n  B -->|No| D[\"Step 2b\"]"
}
```
