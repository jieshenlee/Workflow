// Image Gen helpers: size table, the draft/render webhook calls, and the
// exact-size crop applied on download.

import { N8N_IMAGE_GEN_DRAFT_URL, N8N_IMAGE_GEN_RENDER_URL, n8nPost, pgPatch, pgPost } from './api'
import type { BrandProject, BrandReference, BriefCheck, ImageGenGeneration, ImageGenJob, ImageGenSize } from './types'

// Keep in sync with SIZES in the "Build Requests" node of workflows/image-gen-render.json.
// Gemini renders at the aspect ratio; the exact pixel size is applied by cropToSize on download.
export const SIZES: Record<ImageGenSize, { label: string; aspect: string; w: number; h: number; hint: string }> = {
  post:     { label: 'Square post',   aspect: '1:1',  w: 1080, h: 1080, hint: 'Instagram / Facebook / LinkedIn feed' },
  portrait: { label: 'Portrait post', aspect: '4:5',  w: 1080, h: 1350, hint: 'Meme, Static Post, Carousel' },
  story:    { label: 'Story / Reel',  aspect: '9:16', w: 1080, h: 1920, hint: 'Stories, Reels, TikTok' },
  banner:   { label: 'Banner',        aspect: '16:9', w: 1200, h: 628,  hint: 'Blog / link preview (cropped from 16:9)' },
}
export const SIZE_ORDER: ImageGenSize[] = ['post', 'portrait', 'story', 'banner']

// Gemini 2.5 Flash Image list price (~$0.039 per output image). Estimate only.
export const COST_PER_IMAGE = 0.039

export const MAX_REFERENCE_BYTES = 5 * 1024 * 1024  // Claude vision rejects images over 5 MB
export const MAX_REFERENCES_PER_DRAFT = 6

export function dataUrl(b64: string, mime: string | null | undefined) {
  return `data:${mime || 'image/png'};base64,${b64}`
}

export function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve({ b64: comma >= 0 ? result.slice(comma + 1) : result, mime: file.type || 'image/jpeg' })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export interface DraftResult {
  ok: boolean
  prompt: string
  brief_check: BriefCheck
}

export async function draftPrompt(args: {
  brand: BrandProject
  ask: string
  sizes: ImageGenSize[]
  references: BrandReference[]
  previousPrompt?: string
  changeNote?: string
}): Promise<DraftResult> {
  const data = await n8nPost(N8N_IMAGE_GEN_DRAFT_URL, {
    ask: args.ask,
    brand_name: args.brand.name,
    brief: args.brand.brief,
    sizes: args.sizes,
    references: args.references.slice(0, MAX_REFERENCES_PER_DRAFT).map(r => ({ b64: r.image_b64, mime: r.mime_type })),
    previous_prompt: args.previousPrompt,
    change_note: args.changeNote,
  }) as DraftResult
  if (!data?.ok || !data.prompt) throw new Error('Draft workflow returned no prompt')
  return data
}

/** Writes a queued job + one generation row per size, then kicks the render workflow. */
export async function queueJob(args: {
  brandId: string
  ask: string
  prompt: string
  briefCheck: BriefCheck | null
  sizes: ImageGenSize[]
  referenceIds: string[]
  parentJobId?: string
  changeNote?: string
}): Promise<ImageGenJob> {
  const [job] = await pgPost<ImageGenJob[]>('/image_gen_jobs', {
    brand_id: args.brandId,
    prompt_raw: args.ask,
    prompt_drafted: args.prompt,
    brief_check: args.briefCheck,
    sizes: args.sizes,
    reference_ids: args.referenceIds,
    parent_job_id: args.parentJobId ?? null,
    change_note: args.changeNote ?? null,
    status: 'queued',
  })
  await pgPost<ImageGenGeneration[]>('/image_gen_generations', args.sizes.map(size => ({ job_id: job.id, size })))
  await startRender(job.id)
  return job
}

export async function startRender(jobId: string) {
  try {
    await n8nPost(N8N_IMAGE_GEN_RENDER_URL, { job_id: jobId })
  } catch (err) {
    await pgPatch(`/image_gen_jobs?id=eq.${jobId}`, {
      status: 'failed',
      error: `Could not start render workflow: ${err instanceof Error ? err.message : String(err)}`,
    })
    throw err
  }
}

/** Re-renders a job's failed sizes (or a stuck queued/running job). */
export async function retryJob(job: ImageGenJob) {
  const gens = job.image_gen_generations || []
  const toRetry = gens.filter(g => g.render_status !== 'done').map(g => g.id)
  if (toRetry.length) {
    await pgPatch(`/image_gen_generations?id=in.(${toRetry.join(',')})`, { render_status: 'rendering', error: null })
  }
  await pgPatch(`/image_gen_jobs?id=eq.${job.id}`, { status: 'queued', error: null })
  await startRender(job.id)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Centre-crops (cover) the render to the size's exact pixel dimensions and returns a PNG data URL. */
export async function cropToSize(b64: string, mime: string | null, size: ImageGenSize): Promise<string> {
  const { w, h } = SIZES[size]
  const img = await loadImage(dataUrl(b64, mime))
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

export function slugify(s: string, max = 40) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || 'image'
}
