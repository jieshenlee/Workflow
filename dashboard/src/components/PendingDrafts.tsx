import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { n8nPost, pgGet } from '../lib/api'
import type { ApprovalStage, ContentJob } from '../lib/types'
import { AIBadge } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'
import { ExportButtons } from './ui/ExportButtons'

export interface PendingDraft extends ApprovalStage {
  content_jobs: ContentJob
  content: { markdown?: string } & Record<string, unknown>
}

export default function PendingDrafts() {
  const { data, isLoading, error } = useQuery<PendingDraft[]>({
    queryKey: ['pending-drafts'],
    queryFn: () =>
      pgGet<PendingDraft[]>(
        '/approval_stages?stage_number=eq.3&status=eq.pending&select=*,content_jobs(*)&order=created_at.desc',
      ),
  })

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Drafts awaiting approval</h2>
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
            Nothing pending. Approve an outline to generate a draft.
          </div>
        </div>
      )}
      {data && data.map(a => <DraftCard key={a.id} approval={a} />)}
    </section>
  )
}

export function DraftCard({ approval }: { approval: PendingDraft }) {
  const job = approval.content_jobs
  const markdown = approval.content?.markdown || ''

  const [notes, setNotes] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!approval.resume_url) throw new Error('No resume_url on approval row')
      return n8nPost(approval.resume_url, {
        draft_notes: notes.trim(),
      })
    },
    onSuccess: () => {
      toast.notify('Draft approved — Claude is generating the image…')
      queryClient.invalidateQueries({ queryKey: ['pending-drafts'] })
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const wordCount = markdown.split(/\s+/).filter(Boolean).length
  const readMins = Math.max(1, Math.round(wordCount / 230))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <div>
          <div className="card-h-title">{job.topic}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Stage 3 &middot; Draft review</div>
        </div>
        <AIBadge label="Claude" />
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {job.chosen_angle && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="chip">Angle: {job.chosen_angle}</span>
            <span className="chip">~{wordCount.toLocaleString()} words</span>
            <span className="chip">~{readMins} min read</span>
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
            <label className="label" style={{ marginBottom: 0 }}>Draft</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ExportButtons markdown={markdown} title={job.topic} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
          </div>
          {!collapsed && (
            <div className="editor-wrap">
              <div className="editor">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
              <div className="editor-foot">
                <span>{wordCount.toLocaleString()} words</span>
                <span>&middot;</span>
                <span>~{readMins} min read</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label">
            Notes <span style={{ textTransform: 'none', color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            className="textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder='e.g. "Punch up the intro." Or leave blank to approve as-is.'
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Approving advances the job to image generation.
          </span>
          <button
            className="btn btn-green"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Approving…' : (
              <>
                <I.check size={14} sw={2.2} /> Approve draft
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
