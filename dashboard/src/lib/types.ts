export type JobStatus =
  | 'brainstorm'
  | 'research'
  | 'outline'
  | 'drafting'
  | 'image'
  | 'cms'
  | 'published'
  | 'scheduled'
  | 'archived'
  | 'failed'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited'

export interface BrainstormAngle {
  headline: string
  hook: string
  angle_type: string
  target_reader: string
}

export interface Brainstorm {
  angles: BrainstormAngle[]
  recommendation?: string
}

export interface ContentJob {
  id: string
  topic: string
  branch: 'blog' | 'social'
  status: JobStatus
  chosen_angle: string | null
  keywords: string[] | null
  blog_url: string | null
  shortlink: string | null
  image_url: string | null
  outline: unknown | null
  draft_md: string | null
  target_word_count: number | null
  chosen_image_id: string | null
  data: { brainstorm?: Brainstorm; [k: string]: unknown }
  n8n_execution_id: string | null
  created_at: string
  updated_at: string
}

export interface ApprovalStage {
  id: string
  job_id: string
  stage_number: number
  stage_name: string
  content: any
  edited_content: any
  status: ApprovalStatus
  feedback: string | null
  resume_url: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type Platform =
  | 'linkedin'
  | 'pinterest'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'threads'

export type SocialContentType =
  | 'meme'
  | 'static'
  | 'carousel'
  | 'reel'
  | 'blog'
  | 'linkedin_article'

export interface PlatformCaption {
  id: string
  job_id: string
  platform: Platform
  content_type: SocialContentType
  aspect_ratio: string
  caption: Record<string, unknown>
  status: ApprovalStatus
  image_url: string | null
  metricool_post_id: string | null
}

export interface CmsFields {
  title: string
  slug: string
  author: string
  category: string
  reading_time: number
  excerpt: string
  cover_alt: string
  meta_title: string
  meta_description: string
}

export type ImageSource = 'ai_generated' | 'upload'

export interface LibraryImage {
  id: string
  source: ImageSource
  prompt: string | null
  image_b64: string
  mime_type: string
  title: string | null
  generated_by: string | null
  created_at: string
  // Legacy fields still present on rows fetched from the old `generated_images`
  // table. Drop once everything migrates to the unified `images` table +
  // content_jobs.chosen_image_id.
  is_chosen?: boolean
  job_id?: string
}

/** @deprecated Use LibraryImage. Kept for any lingering imports during the refactor. */
export type GeneratedImage = LibraryImage

export type InspirationType = 'image' | 'video'

export type InspirationCategory =
  | 'tv_shows'
  | 'streaming'
  | 'gadgets'
  | 'tools'
  | 'games'
  | 'movies'
  | 'ai'
  | 'anime'
  | 'esports'
  | 'other'

export interface InspirationItem {
  id: string
  type: InspirationType
  category: InspirationCategory
  source_caption: string | null
  telegram_chat_id: string | null
  telegram_message_id: string | null
  preview_b64: string | null
  preview_mime_type: string | null
  ai_summary: string | null
  ai_tags: string[] | null
  created_at: string
  updated_at: string
}

export type GuidelineSourceType = 'pdf' | 'blog' | 'screenshot'
export type GuidelineStatus = 'pending_review' | 'published'

export interface GuidelineItem {
  id: string
  source_type: GuidelineSourceType
  title: string
  source_url: string | null
  file_b64: string | null
  file_mime_type: string | null
  extracted_text: string | null
  ai_category: string | null
  category: string | null
  ai_summary: string | null
  audio_b64: string | null
  audio_mime_type: string | null
  status: GuidelineStatus
  created_at: string
  updated_at: string
}

export type ImageMakerStatus = 'generating' | 'completed' | 'failed'

export interface ImageMakerProject {
  id: string
  instruction: string
  reference_image_b64: string
  reference_mime_type: string
  status: ImageMakerStatus
  slogans: string[] | null
  generated_image_b64: string | null
  generated_mime_type: string | null
  error: string | null
  saved_to_library: boolean
  library_image_id: string | null
  created_at: string
  updated_at: string
}

export type ImageCheckStatus = 'checking' | 'completed' | 'failed'
export type ImageCheckVerdict = 'match' | 'partial_match' | 'mismatch'

export interface GrammarIssue {
  issue: string
  suggestion: string
}

export interface ImageCheck {
  id: string
  request_text: string
  image_b64: string
  mime_type: string
  status: ImageCheckStatus
  summary: string | null
  extracted_text: string | null
  grammar_issues: GrammarIssue[] | null
  verdict: ImageCheckVerdict | null
  verdict_reason: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type VideoTemplateMode = 'flowchart' | 'checklist'
export type VideoTemplateStatus = 'processing' | 'ready' | 'failed'

export interface ChecklistItem {
  step: string
  detail: string
}

export interface VideoTemplate {
  id: string
  youtube_url: string
  mode: VideoTemplateMode
  title: string
  ai_summary: string | null
  mermaid_code: string | null
  checklist_json: ChecklistItem[] | null
  status: VideoTemplateStatus
  error_message: string | null
  created_at: string
  updated_at: string
}
