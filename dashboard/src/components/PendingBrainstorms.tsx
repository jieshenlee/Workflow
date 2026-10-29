import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { n8nPost, pgGet } from '../lib/api'
import type { ApprovalStage, Brainstorm, ContentJob } from '../lib/types'
import { AIBadge } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'

export interface PendingBrainstorm extends ApprovalStage {
  content_jobs: ContentJob
}

export default function PendingBrainstorms() {
  const { data, isLoading, error } = useQuery<PendingBrainstorm[]>({
    queryKey: ['pending-brainstorms'],
    queryFn: () =>
      pgGet<PendingBrainstorm[]>(
        '/approval_stages?stage_number=eq.1&status=eq.pending&select=*,content_jobs(*)&order=created_at.desc',
      ),
  })

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Brainstorms awaiting approval</h2>
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
            Nothing pending. Start a topic above to begin.
          </div>
        </div>
      )}
      {data && data.map(a => <BrainstormCard key={a.id} approval={a} />)}
    </section>
  )
}

export function BrainstormCard({ approval }: { approval: PendingBrainstorm }) {
  const job = approval.content_jobs
  const brainstorm = (approval.content || {}) as Brainstorm & { parse_error?: string; raw?: string }
  const angles = brainstorm.angles || []

  const [selectedAngle, setSelectedAngle] = useState(angles[0]?.headline ?? '')
  const [notes, setNotes] = useState('')
  const [keywords, setKeywords] = useState('')
  const [wordCount, setWordCount] = useState<number>(1500)

  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!approval.resume_url) throw new Error('No resume_url on approval row')
      return n8nPost(approval.resume_url, {
        chosen_angle: selectedAngle,
        angle_notes: notes.trim(),
        keywords: keywords.trim(),
        target_word_count: wordCount,
      })
    },
    onSuccess: () => {
      toast.notify('Angle approved — Claude is generating the outline…')
      queryClient.invalidateQueries({ queryKey: ['pending-brainstorms'] })
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  if (brainstorm.parse_error) {
    return (
      <div className="card" style={{ marginBottom: 14, borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
        <div className="card-body">
          <p style={{ margin: 0, fontWeight: 500, color: 'var(--red)' }}>
            Brainstorm parse error for: {job.topic}
          </p>
          <p style={{ marginTop: 4, fontSize: 13, color: 'var(--red)' }}>
            Claude&rsquo;s response couldn&rsquo;t be parsed as JSON. Re-run the workflow or fix the prompt.
          </p>
          <pre className="mono" style={{ marginTop: 10, maxHeight: 160, overflow: 'auto', background: 'white', padding: 10, borderRadius: 6, fontSize: 12 }}>
            {brainstorm.raw}
          </pre>
        </div>
      </div>
    )
  }

  const previewAngle = angles.find(a => a.headline === selectedAngle)

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <div>
          <div className="card-h-title">{job.topic}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Stage 1 &middot; Brainstorm review</div>
        </div>
        <AIBadge label="Claude haiku 4.5" />
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label className="label">Pick an angle</label>
          <select
            className="select"
            value={selectedAngle}
            onChange={e => setSelectedAngle(e.target.value)}
          >
            {angles.map((a, i) => (
              <option key={i} value={a.headline}>
                {i + 1}. {a.headline} &mdash; {a.angle_type}
              </option>
            ))}
          </select>

          {previewAngle && (
            <div className="ai-block" style={{ marginTop: 10, marginLeft: 10, padding: 12, background: 'var(--ai-50)', borderRadius: 6, fontSize: 13 }}>
              <p style={{ margin: 0, color: 'var(--text-2)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>Hook:</span> {previewAngle.hook}
              </p>
              <p style={{ margin: '4px 0 0', color: 'var(--text-2)' }}>
                <span style={{ fontWeight: 500, color: 'var(--text)' }}>For:</span> {previewAngle.target_reader}
              </p>
            </div>
          )}

          {brainstorm.recommendation && (
            <details style={{ marginTop: 10, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>
                Claude&rsquo;s reasoning
              </summary>
              <p style={{ margin: '6px 0 0', color: 'var(--text-2)' }}>{brainstorm.recommendation}</p>
            </details>
          )}
        </div>

        <div>
          <label className="label">
            Additions or tweaks <span style={{ textTransform: 'none', color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            className="textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder='e.g. "Lean harder into the cost angle. Add a section on free tools."'
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <div>
            <label className="label">
              Target keywords <span style={{ textTransform: 'none', color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              className="input"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="ai content marketing, small business seo"
            />
          </div>
          <div>
            <label className="label">Target word count</label>
            <input
              type="number"
              className="input"
              value={wordCount}
              onChange={e => setWordCount(Number(e.target.value) || 0)}
              min={300}
              max={5000}
              step={100}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Approving kicks off outline generation.
          </span>
          <button
            className="btn btn-green"
            onClick={() => mutation.mutate()}
            disabled={!selectedAngle || mutation.isPending}
          >
            {mutation.isPending ? 'Approving…' : (
              <>
                <I.check size={14} sw={2.2} /> Approve &amp; generate outline
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
