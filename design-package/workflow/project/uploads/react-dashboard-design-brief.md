# Project Digital — React Dashboard UI Design Brief

## Purpose
An internal approval dashboard for a solo content creator. Every piece of content passes through human review stages before being published. The dashboard surfaces drafts, enables inline editing, triggers AI regeneration, and sends approvals to an n8n automation backend via webhooks.

## Design Language
- Clean, minimal, professional — this is a working tool, not a marketing page
- Dark sidebar navigation, white content area
- Status-driven UI — every content job has a visible stage indicator (pipeline progress bar)
- Primary colour: deep indigo or slate blue
- Accent colours: green (approved), amber (needs edits), red (rejected), purple (AI-generated content)
- Font: Inter or similar sans-serif
- Mobile not required — desktop only (1280px+)

---

## Global Layout

**Persistent left sidebar:**
- Logo / project name "Project Digital" at top
- Navigation links: Dashboard, Blog Jobs, Social Jobs, Image Library, Settings
- Small user avatar + name at bottom

**Main content area:**
- Page title + breadcrumb at top
- Content cards or split-panel editing views per stage

---

## Screen 1 — Dashboard / Pipeline Overview

**Purpose:** See all active content jobs at a glance.

**Components:**
- Stats row at top: Total Jobs, Awaiting Approval, Published Today, Scheduled
- Table or card grid of all content jobs, each showing:
  - Job title / topic
  - Type badge: "Blog" or "Social"
  - Current stage pill (e.g. "Awaiting Blog Draft Approval", "Image Review", "Ready to Publish")
  - Platform icons (Instagram, LinkedIn, TikTok, etc.) where relevant
  - Created date
  - Action button: "Review →"
- Filter tabs: All / Blog / Social / Pending / Published

---

## Screen 2 — Blog: Draft Outline Review

**Purpose:** Review and approve the AI-generated blog outline before drafting begins.

**Components:**
- Left panel: Editable outline (H1, H2, H3 structure with bullet points per section)
  - Inline edit on click
  - Add / remove sections
- Right panel: Context — Topic, Keywords used, Target audience note
- Bottom action bar:
  - "Request Edits" button (amber) — sends back for AI revision with optional note
  - "Approve Outline →" button (green) — advances to draft stage

---

## Screen 3 — Blog: Draft Review & Editor

**Purpose:** The most important screen. Review, edit, and approve the full Claude-generated blog draft.

**Components:**
- Full-width rich text editor (similar to Notion or a clean WYSIWYG)
  - Inline editing enabled
  - Word count + reading time shown
- Collapsible right sidebar: SEO preview (meta title, meta description, slug)
- Stage indicator at top: "Blog Draft — Awaiting Approval"
- Bottom action bar:
  - "Request AI Edits" (amber) — text input field slides open to describe what to change, sends to Claude API
  - "Approve Blog →" (green) — advances to image generation

---

## Screen 4 — Blog: Image Prompt Review

**Purpose:** Review the Claude-generated image prompt before sending it to Gemini or ChatGPT for image generation.

**Components:**
- Large text area showing the AI-generated image prompt (editable)
- "Regenerate Prompt" button — Claude rewrites the prompt
- Model selector: toggle between Gemini Imagen / DALL-E 3 / ChatGPT
- "Generate Image →" button (primary) — calls the selected image API
- Stage indicator: "Image Prompt — Review before generating"

---

## Screen 5 — Blog: Image Approval

**Purpose:** Approve or request changes to the generated image.

**Components:**
- Large image preview (centred, 16:9 or 4:5 preview)
- Below image: prompt used (read-only, small text)
- Action buttons:
  - "Request Changes" (amber) — opens text input to describe changes, loops back to prompt editing
  - "Regenerate Same Prompt" — re-runs the same prompt
  - "Upload Custom Image" — file picker override
  - "Approve Image →" (green) — advances to CMS publish
- Stage indicator: "Image Review"

---

## Screen 6 — Blog: Publish to Sanity CMS

**Purpose:** Final review before publishing to Sanity and getting a Bitly short URL.

**Components:**
- Preview panel showing the full blog post as it will appear (title, hero image, content)
- Metadata fields (editable): Slug, Category, Tags, Publish date/time picker
- Bitly section: empty until published, then shows the short URL with copy button
- Action buttons:
  - "Publish to Sanity" (green) — triggers n8n webhook to publish and generate Bitly URL
  - "Save as Draft" — stores without publishing
- Stage indicator: "Ready to Publish"

---

## Screen 7 — Social: Platform & Content Type Selection

**Purpose:** Choose which platforms and what content type to create for this topic.

**Components:**
- Platform multi-select grid (toggle cards with platform logo):
  - Pinterest, Instagram, Facebook, TikTok, YouTube, X, Threads, LinkedIn, Reddit
  - Each card shows a checkbox + "will require caption" note
  - LinkedIn has a sub-option: "Standard Post" or "Article"
  - Reddit shows "(if concept is worthy)" label
- Content type selector (radio cards):
  - Meme → badge "4:5"
  - Static Post → badge "4:5"
  - Carousel → badge "4:5"
  - Reel → badge "9:16"
- "Continue to Image Prompt →" button

---

## Screen 8 — Social: Image Prompt Review

**Purpose:** Review Claude's generated image prompt for the social content.

**Components:**
- Editable text area with Claude's image prompt
- Content type + platform context shown above (e.g. "Static Post — Instagram, Pinterest")
- "Regenerate Prompt" button
- Model selector: Gemini / DALL-E 3
- "Generate Image →" button (primary)
- Stage indicator: "Social Image Prompt"

---

## Screen 9 — Social: Image Approval

**Purpose:** Same as blog image approval but in a social context.

**Components:**
- Image preview with aspect ratio frame (4:5 or 9:16 shown to scale)
- "Request Changes" / "Regenerate" / "Upload Custom" / "Approve →" buttons
- Note below: "After approval, this image will go to Canva (static) or CapCut (video) for formatting"
- Stage indicator: "Social Image Review"

---

## Screen 10 — Social: Caption & Hashtag Editor

**Purpose:** Review and edit Claude's written captions per platform before posting.

**Components:**
- Tabbed interface — one tab per selected platform (e.g. Instagram | Facebook | TikTok | LinkedIn | Pinterest | X | Threads | Reddit)
- Per tab:
  - Platform icon + name
  - Character count with platform limit indicator (e.g. X: 280 chars shown as a progress bar)
  - Editable caption text area
  - Editable hashtags field (shown as tag pills)
  - "Regenerate Caption for this platform" button
- Bottom of all tabs:
  - "Approve All Captions →" (green)
  - "Save & Come Back" (outline button)

---

## Screen 11 — Social: Resize & Format Instructions

**Purpose:** Remind the user to resize in Canva or CapCut before posting.

**Components:**
- Checklist card:
  - [ ] Resize image in Canva to correct aspect ratio
  - [ ] Add music (for Reels/TikTok)
  - [ ] Edit video in CapCut (if Reel)
- Upload field: "Upload final formatted asset"
- Once asset uploaded, a preview appears
- "Ready to Post →" button becomes active

---

## Screen 12 — Social: Final Post Review

**Purpose:** Final overview before scheduling or posting.

**Components:**
- Summary card showing:
  - Topic / idea
  - Final image (thumbnail)
  - Captions per platform (collapsed, expandable)
  - Bitly short URL (if blog was also published)
- Schedule toggle: "Post Now" or "Schedule for later" (date/time picker)
- "Post to All Platforms" (green) — triggers Buffer API via n8n
- Stage indicator: "Ready to Post"

---

## Reusable Components Across All Screens

- **Stage progress bar** — horizontal stepper at top of each screen showing current stage in the pipeline
- **AI badge** — purple "✦ AI Generated" pill on any content block created by Claude
- **Action bar** — fixed bottom bar with primary and secondary action buttons
- **Webhook status toast** — small notification confirming n8n webhook was triggered successfully
- **Regenerate button** — appears next to any AI-generated content (blog, outline, caption, image prompt)

---

## Colour Coding for Status

| Status | Colour |
|---|---|
| AI Generated | Purple |
| Awaiting Review | Amber |
| Approved | Green |
| Rejected / Needs Edits | Red |
| Published | Blue |
| Scheduled | Teal |
