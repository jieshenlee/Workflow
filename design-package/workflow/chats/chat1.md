# Design Documentation

_Started 2026-05-26 13:45 UTC_

---

## User

Go ahead whats in the design md file

## Assistant

_[tool: read_file]_

_[tool: update_todos]_

Got it — the brief is detailed and the flowchart aligns cleanly with the 12 screens. I'll build this as a fully interactive prototype: a single app with the dark sidebar, a job dashboard, and clickable navigation through both pipelines (Blog: outline → draft → image prompt → image approval → publish, and Social: platforms → prompt → image → captions → format → post).

Design choices I'm committing to:
- **Primary**: deep slate-indigo (#4338CA / `oklch` slate-blue), dark sidebar #0F172A
- **Status palette**: purple (AI), amber (review), green (approved), red (edits), blue (published), teal (scheduled)
- **Type**: Inter (called out in brief)
- **Density**: working-tool tight, not marketing-airy
- **Pattern**: stage-stepper at the top of every pipeline screen + fixed action bar at bottom

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

## Assistant

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: update_todos]_

_[tool: show_html]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Built the full **Project Digital** dashboard — 12 working screens wired into a single React prototype.

**What's in there:**
- Dark sidebar (Dashboard / Blog / Social / Image Library / Settings) with pending-count badges + recent jobs
- **Dashboard**: 4-stat row, filter tabs, full job table with type/stage/platform/created columns and a Review action
- **Blog flow** (5 screens): Outline → Draft (with editable rich-text + SEO sidebar) → Image Prompt → Image Approval (with variations) → Publish to Sanity (with Bitly URL appearing post-publish)
- **Social flow** (6 screens): Platform multi-select (LinkedIn sub-toggle, content-type radio cards w/ aspect badges) → Image Prompt → Image Approval → Tabbed Caption Editor (per-platform char limits + live preview) → Format checklist + upload → Final Post Review with schedule toggle

**Reusables built:** stage stepper, AI badge, status pills (purple/amber/green/red/blue/teal per brief), fixed action bar, webhook toast that fires on every approval. Clicking **Review** on any dashboard job drops you into the pipeline at that job's current stage — so the demo flows naturally.

**Caveats / next steps:**
- Images are dashed monospace placeholders (per house style — never hand-draw SVG art). Drop real renders into the placeholders when you have them.
- Image Library + Settings pages are stubs.
- No Tweaks panel yet — easy add if you want to expose accent color, sidebar variants, etc.

## User

Save this design as a PDF: Project Digital.html

## Assistant

_[tool: write_file]_

I'll create a print-ready version that stacks all 12 screens as paged sections.

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: str_replace_edit]_

Clean. Adding the auto-print script.

_[tool: open_for_print]_

Print tab should open with the print dialog automatically. If it didn't, [open the print page here](https://f6d9394b-8402-4c0b-b49f-19f4640bcfd6.claudeusercontent.com/v1/design/projects/f6d9394b-8402-4c0b-b49f-19f4640bcfd6/serve/Project%20Digital-print.html?t=ea58465cd67e36e377c6757cbbdb5a5f480bf591d1fbfd1c5c2702575ea63bdc.bbb0760f-9ebb-4f14-b852-95584021cfa7.ba24403d-405f-403d-8872-726b4687f4e4.1779806723&direct=1) and use Cmd/Ctrl+P. All 12 screens are stacked, one per page.

