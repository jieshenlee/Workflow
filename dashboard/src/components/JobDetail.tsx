import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { N8N_REPURPOSE_SOCIAL_URL, n8nPost, pgDelete, pgGet, pgPatch, shortenUrl } from '../lib/api'
import type { ApprovalStage, ContentJob, GeneratedImage, JobStatus, PlatformCaption } from '../lib/types'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'
import { ExportButtons } from './ui/ExportButtons'
import { exportImageBase64, slugify } from '../lib/export'
import { PlatformIcon, PLATFORM_META } from './ui/PlatformIcon'
import { PublishPanel } from './PublishPanel'
import { BrainstormCard, type PendingBrainstorm } from './PendingBrainstorms'
import { OutlineCard, type PendingOutline } from './PendingOutlines'
import { DraftCard, type PendingDraft } from './PendingDrafts'
import { ImageCard, type PendingImage } from './PendingImages'
import { CaptionsCard, type PendingCaption } from './PendingCaptions'

interface JobWithImages extends ContentJob {
  generated_images?: GeneratedImage[]
  platform_captions?: PlatformCaption[]
}

interface PendingForJob extends ApprovalStage {
  content_jobs: JobWithImages
}

interface OutlineSection {
  heading: string
  intent?: string
  word_count?: number
  subsections?: OutlineSection[]
}

interface Outline {
  title?: string
  meta_description?: string
  sections?: OutlineSection[]
}

function captionPrimaryText(c: PlatformCaption): string {
  const cap = (c.caption || {}) as Record<string, unknown>
  if (c.platform === 'linkedin') return String(cap.body ?? '')
  if (c.platform === 'x') return String(cap.single_post ?? '')
  if (c.platform === 'instagram') return String(cap.caption ?? '')
  return String(cap.body ?? cap.caption ?? cap.single_post ?? '')
}

function captionHashtags(c: PlatformCaption): string[] {
  const h = (c.caption as Record<string, unknown>)?.hashtags
  return Array.isArray(h) ? (h as string[]) : []
}

function captionLink(c: PlatformCaption, shortlink = ''): { label: string; url: string } | null {
  // job.shortlink is always authoritative — caption JSON fields are fallback only
  const cap = (c.caption || {}) as Record<string, unknown>
  if (c.platform === 'instagram' || c.platform === 'tiktok') {
    const url = shortlink || String(cap.link_in_bio ?? '')
    return url ? { label: 'Link in bio', url } : null
  }
  if (c.platform === 'linkedin') {
    const url = shortlink || String(cap.first_comment_link ?? '')
    return url ? { label: 'First comment', url } : null
  }
  if (c.platform === 'pinterest') {
    const url = shortlink || String(cap.destination_url ?? '')
    return url ? { label: 'Destination URL', url } : null
  }
  const url = shortlink || String(cap.link ?? '')
  return url ? { label: 'Blog link', url } : null
}

const BLOG_STEPS = ['Brainstorm', 'Outline', 'Draft', 'Image', 'Publish']

const STATUS_STEP: Record<JobStatus, number> = {
  brainstorm: 0,
  research: 1,
  outline: 1,
  drafting: 2,
  image: 3,
  cms: 4,
  published: 5,
  scheduled: 5,
  archived: 5,
  failed: 0,
}

type StepState = 'done' | 'cur' | 'pending'

function buildSteps(job: JobWithImages, pendingStage?: number): { label: string; state: StepState }[] {
  const idx = STATUS_STEP[job.status] ?? 0
  const steps: { label: string; state: StepState }[] = BLOG_STEPS.map((label, i) => ({
    label,
    state: i < idx ? 'done' : i === idx ? 'cur' : 'pending',
  }))
  const captions = job.platform_captions || []
  if (captions.length > 0) {
    const captionsPending = pendingStage === 5
    const allApproved = captions.every(c => c.status === 'approved')
    // Hand the "current" marker to Social while captions are in review.
    if (captionsPending && steps[4].state === 'cur') steps[4].state = 'pending'
    steps.push({ label: 'Social', state: captionsPending ? 'cur' : allApproved ? 'done' : 'pending' })
  }
  return steps
}

function Stepper({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <Fragment key={s.label}>
          <div className="step">
            <div className={`step-dot ${s.state}`}>
              {s.state === 'done' ? <I.check size={12} sw={3} /> : i + 1}
            </div>
            <div className={`step-label ${s.state}`}>{s.label}</div>
          </div>
          {i < steps.length - 1 && <div className={`step-line ${s.state === 'done' ? 'done' : ''}`} />}
        </Fragment>
      ))}
    </div>
  )
}

export default function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { data: jobs, isLoading, error } = useQuery<JobWithImages[]>({
    queryKey: ['job', jobId],
    queryFn: () =>
      pgGet<JobWithImages[]>(`/content_jobs?id=eq.${jobId}&select=*,generated_images(*),platform_captions(*)`),
  })

  const { data: pendings } = useQuery<PendingForJob[]>({
    queryKey: ['job-pending', jobId],
    queryFn: () =>
      pgGet<PendingForJob[]>(
        `/approval_stages?job_id=eq.${jobId}&status=eq.pending&select=*,content_jobs(*,generated_images(*),platform_captions(*))&order=stage_number.desc&limit=1`,
      ),
  })

  const job = jobs?.[0]
  const pending = pendings?.[0]

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>
        <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
          <I.arrowRight size={14} />
        </span>
        Back
      </button>

      {isLoading && !job && (
        <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading job…</div></div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
          <div className="card-body" style={{ color: 'var(--red)', fontSize: 13 }}>
            Failed to load job: <span className="mono">{String(error)}</span>
          </div>
        </div>
      )}

      {job && (
        <>
          <PageHeader
            title={job.topic}
            breadcrumb={['Project Digital', job.branch === 'social' ? 'Social Jobs' : 'Blog Jobs', 'Job']}
            actions={
              <a href="http://localhost:5678" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                <I.external size={13} /> n8n
              </a>
            }
            meta={
              <>
                <StatusPill status={job.status} />
                <span className={`pill pill-${job.branch === 'blog' ? 'slate' : 'purple'}`}>
                  {job.branch === 'blog' ? 'Blog' : 'Social'}
                </span>
              </>
            }
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 18 }}>
            <Stepper steps={buildSteps(job, pending?.stage_number)} />

            {pending && <PendingAction pending={pending} jobId={jobId} />}
            <ProjectContent job={job} pendingStage={pending?.stage_number} />
          </div>
        </>
      )}
    </>
  )
}

function PendingAction({ pending, jobId }: { pending: PendingForJob; jobId: string }) {
  switch (pending.stage_number) {
    case 1:
      return <BrainstormCard approval={pending as unknown as PendingBrainstorm} />
    case 2:
      return <OutlineCard approval={pending as unknown as PendingOutline} />
    case 3:
      return <DraftCard approval={pending as unknown as PendingDraft} />
    case 4:
      return <ImageCard approval={pending as unknown as PendingImage} />
    case 5:
      return <CaptionsCard approval={pending as unknown as PendingCaption} />
    default:
      return <GenericApprove pending={pending} jobId={jobId} />
  }
}

// Fallback approve panel for stages without a bespoke card (e.g. a publish gate).
function GenericApprove({ pending, jobId }: { pending: PendingForJob; jobId: string }) {
  const [notes, setNotes] = useState('')
  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!pending.resume_url) throw new Error('No resume_url on approval row')
      return n8nPost(pending.resume_url, { notes: notes.trim() })
    },
    onSuccess: () => {
      toast.notify('Approved — workflow resuming…')
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['job-pending', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  return (
    <div className="card">
      <div className="card-h">
        <div className="card-h-title">{pending.stage_name || `Stage ${pending.stage_number}`} — awaiting approval</div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <textarea
          className="textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes…"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-green" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Approving…' : (<><I.check size={14} sw={2.2} /> Approve</>)}
          </button>
        </div>
        {mutation.isError && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>
            Approve failed: <span className="mono">{String(mutation.error)}</span>
          </p>
        )}
      </div>
    </div>
  )
}

const CONTENT_TABS = ['Draft', 'Image', 'Publish', 'Social'] as const

// Read-only view of whatever the job has produced so far.
function ProjectContent({ job, pendingStage }: { job: JobWithImages; pendingStage?: number }) {
  const outline = (job.outline ?? null) as Outline | null
  const draft = job.draft_md || ''
  const images = job.generated_images || []
  const chosen = images.find(i => i.is_chosen) || images[images.length - 1]
  const captions = job.platform_captions || []
  const hasCaptions = captions.length > 0
  const isProcessing = ['research', 'outline', 'drafting', 'image', 'cms'].includes(job.status)
  const [socialTab, setSocialTab] = useState(0)
  const activeSocial = hasCaptions ? captions[Math.min(socialTab, captions.length - 1)] : null

  // Default to whichever tab best reflects current job state
  const defaultTab = (): number => {
    if (hasCaptions || pendingStage === 5) return 3
    if (job.status === 'cms' || job.status === 'published') return 2
    if (chosen || pendingStage === 4) return 1
    return 0
  }
  const [contentTab, setContentTab] = useState(defaultTab)

  const queryClient = useQueryClient()
  const toast = useToast()
  const getShortlink = useMutation({
    mutationFn: async () => {
      const slug = (job.data as Record<string, unknown> | null)?.cms
        ? ((job.data as Record<string, Record<string, unknown>>).cms?.slug as string | undefined)
        : undefined
      const blogUrl = job.blog_url || (slug ? `https://project-digital-website.vercel.app/blog/${slug}` : null)
      if (!blogUrl) throw new Error('Set the blog slug in the publish panel first')
      const shortlink = await shortenUrl(blogUrl)
      await pgPatch(`/content_jobs?id=eq.${job.id}`, { blog_url: blogUrl, shortlink })
      return shortlink
    },
    onSuccess: (shortlink) => {
      toast.notify('Shortlink saved')
      queryClient.setQueryData<JobWithImages[]>(['job', job.id], old =>
        old?.map(j => j.id === job.id ? { ...j, shortlink } : j),
      )
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
    },
    onError: (e) => toast.notify(String(e)),
  })

  const repurpose = useMutation({
    mutationFn: async () => {
      // Wipe any existing captions + stage-5 gate so we always generate fresh.
      await pgDelete(`/platform_captions?job_id=eq.${job.id}`)
      await pgDelete(`/approval_stages?job_id=eq.${job.id}&stage_number=eq.5`)
      return n8nPost(N8N_REPURPOSE_SOCIAL_URL, {
        job_id: job.id,
        platforms: ['linkedin', 'x', 'instagram'],
        content_type: 'static',
      })
    },
    onSuccess: () => {
      toast.notify('Generating captions with shortlink — Claude is writing LinkedIn, X & Instagram posts…')
      queryClient.invalidateQueries({ queryKey: ['job', job.id] })
      queryClient.invalidateQueries({ queryKey: ['job-pending', job.id] })
      queryClient.invalidateQueries({ queryKey: ['pending-captions'] })
    },
  })

  return (
    <>
      {(job.chosen_angle || (job.keywords && job.keywords.length > 0)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {job.chosen_angle && <span className="chip">Angle: {job.chosen_angle}</span>}
          {(job.keywords ?? []).map((k, i) => (
            <span key={i} className="chip mono">{k}</span>
          ))}
        </div>
      )}

      <div className="card">
        <div className="ptabs" style={{ borderBottom: '1px solid var(--border)' }}>
          {CONTENT_TABS.map((t, i) => (
            <button key={t} className={`ptab ${contentTab === i ? 'active' : ''}`} onClick={() => setContentTab(i)}>{t}</button>
          ))}
        </div>

        {/* ── Draft ── */}
        {contentTab === 0 && (
          <div>
            {isProcessing && !draft && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px' }}>
                <span className="pill pill-blue"><span className="pill-dot" />Working</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Claude is generating — this updates automatically.</span>
              </div>
            )}
            {draft && (
              <div style={{ padding: '12px 20px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{draft.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                  <ExportButtons markdown={draft} title={job.topic} />
                </div>
                <div className="editor-wrap">
                  <div className="editor"><ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown></div>
                </div>
              </div>
            )}
            {!draft && outline?.sections && outline.sections.length > 0 && (
              <div style={{ padding: '12px 20px 20px' }}>
                {outline.title && <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>{outline.title}</h3>}
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {outline.sections.map((s, i) => (
                    <li key={i} className="outline-item h1">
                      <span className="num">{i + 1}</span>
                      <div className="text">
                        <div>{s.heading}</div>
                        {s.intent && <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400, marginTop: 2 }}>{s.intent}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!draft && !outline?.sections && !isProcessing && (
              <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>No draft yet.</div>
            )}
          </div>
        )}

        {/* ── Image ── */}
        {contentTab === 1 && (
          <div className="card-body">
            {chosen ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => exportImageBase64(chosen.image_b64, chosen.mime_type, slugify(job.topic))}>
                    <I.download size={14} /> Download image
                  </button>
                </div>
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', maxWidth: 520 }}>
                  <img src={`data:${chosen.mime_type};base64,${chosen.image_b64}`} alt={`Image for: ${job.topic}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>
                {isProcessing ? 'Image is being generated…' : 'No image yet — it appears after Stage 4 approval.'}
              </div>
            )}
          </div>
        )}

        {/* ── Publish ── */}
        {contentTab === 2 && (
          draft
            ? <PublishPanel job={job} />
            : <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>Draft must be approved before publishing.</div>
        )}

        {/* ── Social ── */}
        {contentTab === 3 && (
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {draft && !pendingStage && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{hasCaptions ? 'Regenerate social captions' : 'Repurpose into social posts'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {hasCaptions ? 'Deletes existing captions and regenerates with the shortlink.' : 'Claude turns this blog into native posts for LinkedIn, X & Instagram.'}
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => repurpose.mutate()} disabled={repurpose.isPending}>
                  <I.social size={14} /> {repurpose.isPending ? 'Generating…' : hasCaptions ? 'Regenerate' : 'Repurpose to social'}
                </button>
              </div>
            )}
            {repurpose.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>Failed: <span className="mono">{String(repurpose.error)}</span></div>}

            {hasCaptions && pendingStage !== 5 && activeSocial && (
              <>
                <div className="ptabs">
                  {captions.map((c, i) => (
                    <button key={c.id} className={`ptab ${i === Math.min(socialTab, captions.length - 1) ? 'active' : ''}`} onClick={() => setSocialTab(i)}>
                      <PlatformIcon platform={c.platform} size={18} />
                      {PLATFORM_META[c.platform]?.name ?? c.platform}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className={`pill pill-${activeSocial.status === 'approved' ? 'green' : 'amber'}`}><span className="pill-dot" />{activeSocial.status}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    const tags = captionHashtags(activeSocial)
                    const text = captionPrimaryText(activeSocial)
                    const formatted = tags.length ? text + '\n\n' + tags.map(t => '#' + String(t).replace(/^#/, '')).join(' ') : text
                    navigator.clipboard.writeText(formatted).then(() => toast.notify(`${PLATFORM_META[activeSocial.platform]?.name ?? activeSocial.platform} copy ready to paste into Metricool`))
                  }} type="button"><I.copy size={13} /> Copy for Metricool</button>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{captionPrimaryText(activeSocial)}</div>
                {captionHashtags(activeSocial).length > 0 && (
                  <div className="hashtags">
                    {captionHashtags(activeSocial).map((t, i) => <span key={i} className="hashtag">#{String(t).replace(/^#/, '')}</span>)}
                  </div>
                )}
                {(() => {
                  const link = captionLink(activeSocial, job.shortlink || '')
                  return link ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--blue-50, #EFF6FF)', borderRadius: 6 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', flexShrink: 0, fontWeight: 500 }}>{link.label}</span>
                      <span className="mono" style={{ fontSize: 12.5, color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</span>
                      {!link.url.includes('tinyurl.com') && (
                        <button className="btn btn-outline btn-sm" style={{ flexShrink: 0 }} onClick={() => getShortlink.mutate()} disabled={getShortlink.isPending} type="button">{getShortlink.isPending ? '…' : 'Shorten'}</button>
                      )}
                      <button className="btn btn-outline btn-sm" style={{ flexShrink: 0, padding: '2px 7px' }} onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.notify(`${link.label} copied`))} type="button"><I.copy size={12} /></button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#F8FAFC', borderRadius: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No shortlink yet</span>
                      <button className="btn btn-outline btn-sm" onClick={() => getShortlink.mutate()} disabled={getShortlink.isPending} type="button">{getShortlink.isPending ? 'Shortening…' : '+ Get shortlink'}</button>
                    </div>
                  )
                })()}
              </>
            )}
            {!draft && <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>Draft must be approved before repurposing to social.</div>}
          </div>
        )}
      </div>
    </>
  )
}
