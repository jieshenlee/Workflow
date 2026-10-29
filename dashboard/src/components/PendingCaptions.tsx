import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { n8nPost, pgGet, pgPatch, shortenUrl } from '../lib/api'
import type { ApprovalStage, ContentJob, Platform, PlatformCaption } from '../lib/types'
import { AIBadge } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'
import { PlatformIcon, PLATFORM_META } from './ui/PlatformIcon'

interface JobWithCaptions extends ContentJob {
  platform_captions?: PlatformCaption[]
}

export interface PendingCaption extends ApprovalStage {
  content_jobs: JobWithCaptions
}

// Per-platform mapping between the stored caption JSON and the single editable
// "main text" field, since each platform's prompt outputs a different shape.
function primaryText(c: PlatformCaption): string {
  const cap = c.caption || {}
  if (c.platform === 'linkedin') return String(cap.body ?? '')
  if (c.platform === 'x') return String(cap.single_post ?? '')
  if (c.platform === 'instagram') return String(cap.caption ?? '')
  return String(cap.body ?? cap.caption ?? cap.single_post ?? '')
}

function withPrimaryText(c: PlatformCaption, text: string): Record<string, unknown> {
  const cap = { ...(c.caption || {}) }
  if (c.platform === 'linkedin') cap.body = text
  else if (c.platform === 'x') cap.single_post = text
  else if (c.platform === 'instagram') cap.caption = text
  else cap.body = text
  return cap
}

function hashtagsOf(c: PlatformCaption): string[] {
  const h = (c.caption || {}).hashtags
  return Array.isArray(h) ? (h as string[]) : []
}

function captionLinkOf(c: PlatformCaption, shortlink = ''): { label: string; note: string; url: string } | null {
  // job.shortlink is always authoritative — caption JSON fields are fallback only
  const cap = (c.caption || {}) as Record<string, unknown>
  if (c.platform === 'instagram' || c.platform === 'tiktok') {
    const url = shortlink || String(cap.link_in_bio ?? '')
    return url ? { label: 'Link in bio', note: 'Set this as your bio link before posting', url } : null
  }
  if (c.platform === 'linkedin') {
    const url = shortlink || String(cap.first_comment_link ?? '')
    return url ? { label: 'First comment', note: 'Paste this as your first comment immediately after posting', url } : null
  }
  if (c.platform === 'pinterest') {
    const url = shortlink || String(cap.destination_url ?? '')
    return url ? { label: 'Destination URL', note: 'Set this as the pin destination link', url } : null
  }
  const url = shortlink || String(cap.link ?? '')
  return url ? { label: 'Blog link', note: 'This link is included in the post copy', url } : null
}

export default function PendingCaptions() {
  const { data, isLoading, error } = useQuery<PendingCaption[]>({
    queryKey: ['pending-captions'],
    queryFn: () =>
      pgGet<PendingCaption[]>(
        '/approval_stages?stage_number=eq.5&status=eq.pending&select=*,content_jobs(*,platform_captions(*))&order=created_at.desc',
      ),
  })

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Social posts awaiting approval</h2>
        {data && data.length > 0 && (
          <span className="pill pill-amber"><span className="pill-dot" />{data.length}</span>
        )}
      </div>

      {isLoading && (
        <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading…</div></div>
      )}
      {error && (
        <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
          <div className="card-body" style={{ color: 'var(--red)', fontSize: 13 }}>
            Failed to load: <span className="mono">{String(error)}</span>
          </div>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>
            Nothing pending. Open a finished blog and click "Repurpose to social".
          </div>
        </div>
      )}
      {data && data.map(a => <CaptionsCard key={a.id} approval={a} />)}
    </section>
  )
}

interface EditState {
  text: string
  hashtags: string[]
}

export function CaptionsCard({ approval }: { approval: PendingCaption }) {
  const job = approval.content_jobs
  const captions = (job?.platform_captions || []).filter(c => c.status !== 'approved')
  const ordered = [...captions].sort((a, b) => a.platform.localeCompare(b.platform))

  const [active, setActive] = useState(0)
  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    const init: Record<string, EditState> = {}
    for (const c of ordered) init[c.id] = { text: primaryText(c), hashtags: hashtagsOf(c) }
    return init
  })
  const [newTag, setNewTag] = useState('')

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
      queryClient.setQueryData<PendingCaption[]>(['pending-captions'], old =>
        old?.map(a =>
          a.id === approval.id
            ? { ...a, content_jobs: { ...a.content_jobs, shortlink } }
            : a,
        ),
      )
      queryClient.invalidateQueries({ queryKey: ['pending-captions'] })
    },
    onError: (e) => toast.notify(String(e)),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      // Persist edits + mark each platform caption approved, then resume n8n.
      await Promise.all(
        ordered.map(c =>
          pgPatch(`/platform_captions?id=eq.${c.id}`, {
            caption: { ...withPrimaryText(c, edits[c.id].text), hashtags: edits[c.id].hashtags },
            status: 'approved',
          }),
        ),
      )
      if (!approval.resume_url) throw new Error('No resume_url on approval row')
      return n8nPost(approval.resume_url, { approved: true })
    },
    onSuccess: () => {
      toast.notify('Captions approved — workflow resuming…')
      queryClient.invalidateQueries({ queryKey: ['pending-captions'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  if (ordered.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <div className="card-h-title">{job.topic}</div>
        </div>
        <div className="card-body" style={{ color: 'var(--text-3)', fontSize: 13 }}>
          No captions written yet — Claude is still generating them. This card fills in when they're ready.
        </div>
      </div>
    )
  }

  const current = ordered[Math.min(active, ordered.length - 1)]
  const edit = edits[current.id]
  const limit = PLATFORM_META[current.platform]?.limit ?? 2200
  const len = edit.text.length
  const pct = Math.min(100, (len / limit) * 100)
  const fillClass = len > limit ? 'over' : len > limit * 0.9 ? 'warn' : ''

  const setText = (text: string) =>
    setEdits(prev => ({ ...prev, [current.id]: { ...prev[current.id], text } }))
  const removeTag = (tag: string) =>
    setEdits(prev => ({
      ...prev,
      [current.id]: { ...prev[current.id], hashtags: prev[current.id].hashtags.filter(t => t !== tag) },
    }))
  const addTag = () => {
    const t = newTag.trim().replace(/^#/, '')
    if (!t) return
    setEdits(prev => ({
      ...prev,
      [current.id]: { ...prev[current.id], hashtags: [...prev[current.id].hashtags, t] },
    }))
    setNewTag('')
  }

  // Platform-specific extras for read-only context.
  const cap = current.caption || {}
  const thread = current.platform === 'x' && Array.isArray(cap.thread) ? (cap.thread as string[]) : null
  const engagement = current.platform === 'instagram' ? String(cap.engagement_prompt ?? '') : ''

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <div>
          <div className="card-h-title">{job.topic}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Stage 5 · Per-platform captions</div>
        </div>
        <AIBadge label="Claude sonnet 4.6" />
      </div>

      <div className="ptabs">
        {ordered.map((c, i) => (
          <button key={c.id} className={`ptab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
            <PlatformIcon platform={c.platform} size={18} />
            {PLATFORM_META[c.platform]?.name ?? c.platform}
          </button>
        ))}
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <label className="label" style={{ marginBottom: 0 }}>Post copy</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const formatted = edit.hashtags.length
                    ? edit.text + '\n\n' + edit.hashtags.map(t => '#' + t.replace(/^#/, '')).join(' ')
                    : edit.text
                  navigator.clipboard.writeText(formatted).then(() => {
                    toast.notify(`${PLATFORM_META[current.platform]?.name ?? current.platform} copy ready to paste into Metricool`)
                  })
                }}
                type="button"
              >
                <I.copy size={13} /> Copy for Metricool
              </button>
              <span
                className="mono"
                style={{ fontSize: 11.5, color: len > limit ? 'var(--red)' : 'var(--text-3)' }}
              >
                {len.toLocaleString()} / {limit.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="pbar" style={{ marginBottom: 8 }}>
            <div className={`pbar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
          </div>
          <textarea
            className="textarea"
            value={edit.text}
            onChange={e => setText(e.target.value)}
            rows={current.platform === 'x' ? 4 : 8}
            placeholder="Post copy…"
          />
        </div>

        {thread && thread.length > 0 && (
          <div>
            <label className="label">Thread version (read-only for now)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {thread.map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--text-2)', padding: '8px 12px', background: '#F8FAFC', borderRadius: 6 }}>
                  <span className="muted mono" style={{ marginRight: 6 }}>{i + 1}/</span>{t}
                </div>
              ))}
            </div>
          </div>
        )}

        {engagement && (
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            <span className="label" style={{ display: 'inline', marginRight: 6 }}>Engagement prompt:</span>
            {engagement}
          </div>
        )}

        <div>
          <label className="label">Hashtags</label>
          <div className="hashtags" style={{ marginBottom: 8 }}>
            {edit.hashtags.map(tag => (
              <span key={tag} className="hashtag">
                #{tag}
                <span className="x" onClick={() => removeTag(tag)}>×</span>
              </span>
            ))}
            {edit.hashtags.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No hashtags</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Add a hashtag and press Enter"
              style={{ flex: 1 }}
            />
            <button className="btn btn-outline btn-sm" onClick={addTag}>Add</button>
          </div>
        </div>

        {(() => {
          const link = captionLinkOf(current, job.shortlink || '')
          return link ? (
            <div style={{ borderRadius: 8, border: '1px solid var(--blue-100, #BFDBFE)', background: 'var(--blue-50, #EFF6FF)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary)' }}>{link.label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 8 }}>{link.note}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!link.url.includes('tinyurl.com') && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => getShortlink.mutate()}
                      disabled={getShortlink.isPending}
                      type="button"
                    >
                      {getShortlink.isPending ? 'Shortening...' : 'Shorten'}
                    </button>
                  )}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.notify(`${link.label} copied`))}
                    type="button"
                  >
                    <I.copy size={12} /> Copy
                  </button>
                </div>
              </div>
              <span className="mono" style={{ fontSize: 13, color: 'var(--primary)', wordBreak: 'break-all' }}>{link.url}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No shortlink yet</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => getShortlink.mutate()}
                disabled={getShortlink.isPending}
                type="button"
              >
                {getShortlink.isPending ? 'Shortening...' : '+ Get shortlink'}
              </button>
            </div>
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Editing {PLATFORM_META[current.platform]?.name}. "Approve all" saves every tab and resumes the workflow.
          </span>
          <button className="btn btn-green" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Approving…' : (<><I.check size={14} sw={2.2} /> Approve all captions</>)}
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
