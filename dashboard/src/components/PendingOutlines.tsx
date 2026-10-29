import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiPost, pgGet } from '../lib/api'
import type { ApprovalStage, ContentJob } from '../lib/types'
import { AIBadge } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'

interface Outline {
  title: string
  title_alternates: string[]
  meta_description: string
  sections: OutlineSection[]
  open_questions: string[]
  parse_error?: string
  raw?: string
}

interface OutlineSection {
  heading: string
  level: 'h2' | 'h3'
  intent: string
  word_count?: number
  subsections?: OutlineSection[]
}

export interface PendingOutline extends ApprovalStage {
  content_jobs: ContentJob
}

export default function PendingOutlines() {
  const { data, isLoading, error } = useQuery<PendingOutline[]>({
    queryKey: ['pending-outlines'],
    queryFn: () =>
      pgGet<PendingOutline[]>(
        '/approval_stages?stage_number=eq.2&status=eq.pending&select=*,content_jobs(*)&order=created_at.desc',
      ),
  })

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Outlines awaiting approval</h2>
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
            Nothing pending. Approve a brainstorm to generate an outline.
          </div>
        </div>
      )}
      {data && data.map(a => <OutlineCard key={a.id} approval={a} />)}
    </section>
  )
}

export function OutlineCard({ approval }: { approval: PendingOutline }) {
  const job = approval.content_jobs
  const outline = (approval.content || {}) as Outline
  const [notes, setNotes] = useState('')

  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!approval.resume_url) throw new Error('No resume_url on approval row')
      return apiPost(approval.resume_url, {
        outline_notes: notes.trim(),
      })
    },
    onSuccess: () => {
      toast.notify('Outline approved — Claude is writing the draft…')
      queryClient.invalidateQueries({ queryKey: ['pending-outlines'] })
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  if (outline.parse_error) {
    return (
      <div className="card" style={{ marginBottom: 14, borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
        <div className="card-body">
          <p style={{ margin: 0, fontWeight: 500, color: 'var(--red)' }}>
            Outline parse error for: {job.topic}
          </p>
          <p style={{ marginTop: 4, fontSize: 13, color: 'var(--red)' }}>{outline.parse_error}</p>
          <pre className="mono" style={{ marginTop: 10, maxHeight: 160, overflow: 'auto', background: 'white', padding: 10, borderRadius: 6, fontSize: 12 }}>
            {outline.raw}
          </pre>
        </div>
      </div>
    )
  }

  const metaLen = outline.meta_description?.length ?? 0
  const metaWarn = metaLen > 155

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <div>
          <div className="card-h-title">{job.topic}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Stage 2 &middot; Outline review</div>
        </div>
        <AIBadge label="Claude sonnet 4.6" />
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {(job.chosen_angle || (job.keywords && job.keywords.length > 0)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {job.chosen_angle && (
              <span className="chip">Angle: {job.chosen_angle}</span>
            )}
            {(job.keywords ?? []).map((k, i) => (
              <span key={i} className="chip mono">{k}</span>
            ))}
          </div>
        )}

        <div>
          <label className="label">Working title</label>
          <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: '4px 0 0' }}>
            {outline.title}
          </h3>
          {outline.title_alternates && outline.title_alternates.length > 0 && (
            <ul style={{ marginTop: 8, marginLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
              {outline.title_alternates.map((alt, i) => (
                <li key={i}>{alt}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="label">
            Meta description{' '}
            <span style={{ textTransform: 'none', fontWeight: 400, color: metaWarn ? 'var(--red)' : 'var(--text-3)' }}>
              ({metaLen}/155)
            </span>
          </label>
          <p style={{ margin: '4px 0 0', fontSize: 13, fontStyle: 'italic', color: 'var(--text-2)' }}>
            {outline.meta_description}
          </p>
        </div>

        <div>
          <label className="label" style={{ marginBottom: 8 }}>Sections</label>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(outline.sections || []).map((s, i) => (
              <li key={i}>
                <div className="outline-item h1">
                  <span className="num">{i + 1}</span>
                  <div className="text">
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span>{s.heading}</span>
                      {s.word_count != null && (
                        <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>~{s.word_count} words</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400, marginTop: 2 }}>{s.intent}</div>
                  </div>
                </div>
                {s.subsections && s.subsections.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0 36px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {s.subsections.map((sub, j) => (
                      <li key={j} className="outline-item h3">
                        <div className="text">
                          <span style={{ fontWeight: 500, color: 'var(--text)' }}>&rsaquo; {sub.heading}</span>
                          <span style={{ marginLeft: 8 }}>{sub.intent}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>

        {outline.open_questions && outline.open_questions.length > 0 && (
          <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-100)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--amber)' }}>
              Open questions &mdash; you&rsquo;ll need to supply these
            </div>
            <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18, fontSize: 13, color: '#78350F' }}>
              {outline.open_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="label">
            Notes for the draft writer{' '}
            <span style={{ textTransform: 'none', color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            className="textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder='e.g. "Trim section 4. Add a CTA at the end."'
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Approving advances the job to drafting.
          </span>
          <button
            className="btn btn-green"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Approving…' : (
              <>
                <I.check size={14} sw={2.2} /> Approve outline
              </>
            )}
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
