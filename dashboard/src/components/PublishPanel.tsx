import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_GENERATE_META_URL, API_PUBLISH_CMS_URL, apiPost, pgPatch, pgPost, shortenUrl } from '../lib/api'
import type { CmsFields, ContentJob, GeneratedImage } from '../lib/types'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'
import { slugify } from '../lib/export'

type JobForPublish = ContentJob & { generated_images?: GeneratedImage[] }

const BLOG_BASE_URL = 'https://project-digital-website.vercel.app/blog'

// Categories — auto-created in Sanity on first publish via the API's
// publish-cms createIfNotExists. Add/rename here as the blog grows.
const BLOG_CATEGORIES = [
  'Superhero & Comics',
  'Animation',
  'Film & TV',
  'Pop Culture Analysis',
  'Behind the Scenes',
]

function CharCount({ len, min, max }: { len: number; min: number; max: number }) {
  const outOfRange = len < min || len > max
  return (
    <div className="mono" style={{ fontSize: 11, marginTop: 4, color: outOfRange ? 'var(--red)' : 'var(--text-3)' }}>
      {len.toLocaleString()} / {min}–{max} chars
    </div>
  )
}

// Title comes from the blog's H1 (first "# ..." line in the draft).
function firstH1(md: string): string {
  const m = md.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : ''
}

export function PublishPanel({ job }: { job: JobForPublish }) {
  const outline = (job.outline ?? {}) as { title?: string; meta_description?: string }
  const draft = job.draft_md || ''
  const words = draft.split(/\s+/).filter(Boolean).length
  const saved = (job.data?.cms ?? {}) as Partial<CmsFields>
  const images = job.generated_images || []
  const cover = images.find(i => i.is_chosen) || images[images.length - 1]

  const initialTitle = saved.title ?? (firstH1(draft) || outline.title || job.topic)
  const [form, setForm] = useState<CmsFields>({
    title: initialTitle,
    slug: saved.slug ?? slugify(initialTitle),
    author: saved.author ?? '',
    category: saved.category ?? '',
    reading_time: saved.reading_time ?? Math.max(1, Math.round(words / 230)),
    excerpt: saved.excerpt ?? outline.meta_description ?? '',
    cover_alt: saved.cover_alt ?? '',
    meta_title: saved.meta_title ?? '',
    meta_description: saved.meta_description ?? '',
  })
  const [open, setOpen] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof CmsFields>(key: K, value: CmsFields[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // Slug always follows the title (still overridable via the field/Generate).
  const setTitle = (value: string) =>
    setForm(prev => ({ ...prev, title: value, slug: slugify(value) }))

  const queryClient = useQueryClient()
  const toast = useToast()

  const save = useMutation({
    mutationFn: () =>
      pgPatch(`/content_jobs?id=eq.${job.id}`, { data: { ...(job.data || {}), cms: form } }),
    onSuccess: () => {
      toast.notify('CMS fields saved')
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const uploadCover = useMutation({
    mutationFn: (file: File) =>
      new Promise<void>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = async (e) => {
          try {
            const dataUrl = e.target?.result as string
            const [header, b64] = dataUrl.split(',')
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png'
            await pgPatch(`/generated_images?job_id=eq.${job.id}&is_chosen=eq.true`, { is_chosen: false })
            await pgPost('/generated_images', {
              job_id: job.id,
              image_b64: b64,
              mime_type: mimeType,
              is_chosen: true,
              generated_by: 'manual_upload',
              prompt: 'Uploaded manually',
            })
            setUploadPreview(dataUrl)
            resolve()
          } catch (err) { reject(err) }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      }),
    onSuccess: () => {
      toast.notify('Cover image saved')
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
    onError: (e) => toast.notify(String(e)),
  })

  const getShortlink = useMutation({
    mutationFn: async () => {
      const blogUrl = `${BLOG_BASE_URL}/${form.slug}`
      const shortlink = await shortenUrl(blogUrl)
      await pgPatch(`/content_jobs?id=eq.${job.id}`, { blog_url: blogUrl, shortlink })
      return shortlink
    },
    onSuccess: () => {
      toast.notify('Shortlink saved — ready to use in social captions')
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  // Excerpt + alt are AI-generated server-side (the API calls Claude and
  // responds with the text).
  const genExcerpt = useMutation({
    mutationFn: () => apiPost(API_GENERATE_META_URL, { job_id: job.id, field: 'excerpt' }),
    onSuccess: res => {
      const v = (res as { excerpt?: string })?.excerpt
      if (v) set('excerpt', String(v))
      toast.notify('Excerpt generated')
    },
  })
  const genAlt = useMutation({
    mutationFn: () => apiPost(API_GENERATE_META_URL, { job_id: job.id, field: 'alt' }),
    onSuccess: res => {
      const v = (res as { alt?: string; cover_alt?: string })?.alt ?? (res as { cover_alt?: string })?.cover_alt
      if (v) set('cover_alt', String(v))
      toast.notify('Alt text generated')
    },
  })
  const genMetaTitle = useMutation({
    mutationFn: () => apiPost(API_GENERATE_META_URL, { job_id: job.id, field: 'meta_title' }),
    onSuccess: res => {
      const v = (res as { meta_title?: string })?.meta_title
      if (v) set('meta_title', String(v))
      toast.notify('Meta title generated')
    },
  })
  const genMetaDescription = useMutation({
    mutationFn: () => apiPost(API_GENERATE_META_URL, { job_id: job.id, field: 'meta_description' }),
    onSuccess: res => {
      const v = (res as { meta_description?: string })?.meta_description
      if (v) set('meta_description', String(v))
      toast.notify('Meta description generated')
    },
  })

  const publish = useMutation({
    mutationFn: (body: CmsFields) => apiPost(API_PUBLISH_CMS_URL, { job_id: job.id, ...body }),
    onSuccess: () => {
      toast.notify('Published to Sanity')
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const genError = genExcerpt.isError || genAlt.isError || genMetaTitle.isError || genMetaDescription.isError

  // Pre-publish review: list missing/incomplete fields and (where possible)
  // describe the default that will be applied.
  type IssueKind = 'hard' | 'soft' | 'info'
  type Issue = { key: keyof CmsFields; kind: IssueKind; label: string; message: string; default?: string | number }

  const [confirmOpen, setConfirmOpen] = useState(false)

  const excerptFallback = (outline.meta_description ?? '').trim() || draft.slice(0, 155).trim()
  const issues: Issue[] = []
  if (!form.title.trim()) issues.push({ key: 'title', kind: 'hard', label: 'Title', message: 'Required — please fill it in before publishing.' })
  if (!form.category) issues.push({ key: 'category', kind: 'hard', label: 'Category', message: 'Required — pick one from the dropdown.' })
  if (!form.author.trim()) issues.push({ key: 'author', kind: 'soft', label: 'Author', message: "will default to 'Unknown'", default: 'Unknown' })
  if (!form.excerpt.trim()) issues.push({ key: 'excerpt', kind: 'soft', label: 'Excerpt', message: 'will use the outline meta description or first 155 chars of the draft', default: excerptFallback })
  if (!form.cover_alt.trim()) issues.push({ key: 'cover_alt', kind: 'soft', label: 'Cover alt text', message: 'will use the title', default: form.title })
  if (!form.meta_title.trim()) issues.push({ key: 'meta_title', kind: 'info', label: 'Meta title', message: 'Sanity will fall back to the post title.' })
  if (!form.meta_description.trim()) issues.push({ key: 'meta_description', kind: 'info', label: 'Meta description', message: 'Sanity will fall back to the excerpt.' })

  const hasHardIssues = issues.some(i => i.kind === 'hard')

  const handlePublishClick = () => {
    if (issues.length === 0) {
      publish.mutate(form)
      return
    }
    setConfirmOpen(true)
  }

  const publishWithDefaults = () => {
    const patched: CmsFields = { ...form }
    for (const i of issues) {
      if (i.default !== undefined) (patched as unknown as Record<string, unknown>)[i.key] = i.default
    }
    setForm(patched)
    publish.mutate(patched)
    setConfirmOpen(false)
  }

  return (
    <>
    <div className="card">
      <button
        className="card-h"
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div>
          <div className="card-h-title">Publish to Sanity CMS</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            Title, slug, author, category, excerpt, cover &amp; alt — body uses the draft
          </div>
        </div>
        <span className="btn btn-ghost btn-sm">{open ? 'Hide' : 'Edit fields'}</span>
      </button>

      {open && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Title <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-3)' }}>(from the blog H1)</span></label>
            <input className="input" value={form.title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Slug <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-3)' }}>(auto from title)</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input mono" value={form.slug} onChange={e => set('slug', e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-outline btn-sm" onClick={() => set('slug', slugify(form.title))}><I.refresh size={14} /> Generate</button>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <label className="label" style={{ marginBottom: 0 }}>Blog URL &amp; shortlink</label>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Save the shortlink so social captions can use it before publishing.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => getShortlink.mutate()} disabled={getShortlink.isPending || !form.slug} type="button">
                {getShortlink.isPending ? 'Shortening…' : <><I.external size={13} /> Get shortlink</>}
              </button>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', padding: '5px 8px', background: '#F8FAFC', borderRadius: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {BLOG_BASE_URL}/{form.slug || '…'}
            </div>
            {(job.shortlink || getShortlink.data) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 10px', background: 'var(--blue-50, #EFF6FF)', borderRadius: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)', flexShrink: 0, fontWeight: 500 }}>Shortlink</span>
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--primary)', flex: 1 }}>{(getShortlink.data as string | undefined) ?? job.shortlink}</span>
                <button className="btn btn-outline btn-sm" style={{ flexShrink: 0, padding: '2px 7px' }}
                  onClick={() => { const u = (getShortlink.data as string | undefined) ?? job.shortlink; if (u) navigator.clipboard.writeText(u).then(() => toast.notify('Shortlink copied')) }}
                  type="button"><I.copy size={12} /></button>
              </div>
            )}
            {getShortlink.isError && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--red)' }}>{String(getShortlink.error)}</p>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label className="label">Author</label>
              <input className="input" value={form.author} onChange={e => set('author', e.target.value)} placeholder="e.g. Jieshen" />
            </div>
            <div>
              <label className="label">Category <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-3)' }}>(select)</span></label>
              <select className="select" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">Select a category…</option>
                {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Reading time (minutes)</label>
            <input className="input" type="number" min={1} value={form.reading_time} onChange={e => set('reading_time', Number(e.target.value) || 0)} style={{ maxWidth: 160 }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Publish date is set automatically in Sanity.</div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="label" style={{ marginBottom: 0 }}>Excerpt</label>
              <button className="btn btn-outline btn-sm" onClick={() => genExcerpt.mutate()} disabled={genExcerpt.isPending}>
                <I.sparkle size={13} /> {genExcerpt.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
            <textarea className="textarea" rows={3} value={form.excerpt} onChange={e => set('excerpt', e.target.value)} />
          </div>
          <div>
            <label className="label">Cover image &amp; alt text</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 200, flexShrink: 0 }}>
                {(uploadPreview || cover) ? (
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
                    <img src={uploadPreview || `data:${cover!.mime_type};base64,${cover!.image_b64}`} alt={form.cover_alt || 'Cover'} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 120, borderRadius: 8, border: '1px dashed var(--border)', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No cover image</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover.mutate(f) }} />
                <button className="btn btn-outline btn-sm" style={{ width: '100%' }} onClick={() => fileInputRef.current?.click()} disabled={uploadCover.isPending} type="button">
                  {uploadCover.isPending ? 'Uploading…' : (cover || uploadPreview) ? 'Replace image' : 'Upload image'}
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="label" style={{ marginBottom: 0 }}>Alt text</span>
                  <button className="btn btn-outline btn-sm" onClick={() => genAlt.mutate()} disabled={genAlt.isPending}>
                    <I.sparkle size={13} /> {genAlt.isPending ? 'Generating…' : 'Generate'}
                  </button>
                </div>
                <input className="input" value={form.cover_alt} onChange={e => set('cover_alt', e.target.value)} placeholder="Describe the image for accessibility/SEO" />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Shown to screen readers and search engines.</div>
              </div>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <label className="label" style={{ marginBottom: 0 }}>Meta title</label>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Recommended 50–60 chars. Falls back to post title.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => genMetaTitle.mutate()} disabled={genMetaTitle.isPending}>
                <I.sparkle size={13} /> {genMetaTitle.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
            <input className="input" value={form.meta_title} onChange={e => set('meta_title', e.target.value)} />
            <CharCount len={form.meta_title.length} min={50} max={60} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <label className="label" style={{ marginBottom: 0 }}>Meta description</label>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Recommended 150–160 chars. Falls back to excerpt.</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => genMetaDescription.mutate()} disabled={genMetaDescription.isPending}>
                <I.sparkle size={13} /> {genMetaDescription.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
            <textarea className="textarea" rows={3} value={form.meta_description} onChange={e => set('meta_description', e.target.value)} />
            <CharCount len={form.meta_description.length} min={150} max={160} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            <span className="label" style={{ display: 'inline', marginRight: 6 }}>Body:</span>
            uses the approved blog draft ({words.toLocaleString()} words) shown below.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-outline btn-sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save fields'}
            </button>
            <button className="btn btn-green btn-sm" onClick={handlePublishClick} disabled={publish.isPending}>
              <I.check size={14} sw={2.2} /> {publish.isPending ? 'Publishing…' : 'Publish to Sanity'}
            </button>
          </div>
          {save.isError && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>Save failed: <span className="mono">{String(save.error)}</span></p>}
          {genError && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--amber)' }}>Generate failed — is the API running? Check its window for errors.</p>}
          {publish.isError && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--amber)' }}>Publish failed: {String(publish.error)}. Fields still save with "Save fields".</p>}
        </div>
      )}
    </div>

    {confirmOpen && (
      <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
        <div className="modal-card" onClick={e => e.stopPropagation()}>
          <div className="card-h" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="card-h-title">Review before publishing</div>
          </div>
          <div className="card-body" style={{ overflow: 'auto', flex: 1 }}>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 14px' }}>
              {hasHardIssues
                ? 'Some required fields are missing. Fill them in and try again.'
                : 'The blog will upload, but these sections are empty — we\'ll fill in defaults for you:'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {issues.map(i => (
                <div key={i.key} className={`issue-row issue-${i.kind}`}>
                  <span className="issue-dot" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{i.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{i.message}</div>
                    {i.default && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                        Default: {String(i.default).slice(0, 80)}{String(i.default).length > 80 ? '…' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmOpen(false)}>Cancel</button>
            {!hasHardIssues && (
              <button className="btn btn-green btn-sm" onClick={publishWithDefaults} disabled={publish.isPending}>
                <I.check size={14} sw={2.2} /> {publish.isPending ? 'Publishing…' : 'Publish with defaults'}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
