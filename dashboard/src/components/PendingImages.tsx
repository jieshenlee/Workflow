import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiPost, pgGet } from '../lib/api'
import type { ApprovalStage, ContentJob, GeneratedImage } from '../lib/types'
import { AIBadge } from './ui/Badges'
import { I } from './ui/Icon'
import { useToast } from './ui/Toast'

export interface JobWithImages extends ContentJob {
  generated_images?: GeneratedImage[]
}

export interface PendingImage extends ApprovalStage {
  content_jobs: JobWithImages
  content: { image_id?: string; prompt?: string } & Record<string, unknown>
}

export default function PendingImages() {
  const { data, isLoading, error } = useQuery<PendingImage[]>({
    queryKey: ['pending-images'],
    queryFn: () =>
      pgGet<PendingImage[]>(
        '/approval_stages?stage_number=eq.4&status=eq.pending&select=*,content_jobs(*,generated_images(*))&order=created_at.desc',
      ),
  })

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Images awaiting approval</h2>
        {data && data.length > 0 && (
          <span className="pill pill-amber"><span className="pill-dot" />{data.length}</span>
        )}
      </div>

      {isLoading && (
        <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading&hellip;</div></div>
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
            Nothing pending. Approve a draft to generate an image.
          </div>
        </div>
      )}
      {data && data.map(a => <ImageCard key={a.id} approval={a} />)}
    </section>
  )
}

export function ImageCard({ approval }: { approval: PendingImage }) {
  const job = approval.content_jobs
  const images = job?.generated_images || []
  const chosen =
    images.find(i => i.id === approval.content?.image_id) ||
    images.find(i => i.is_chosen) ||
    images[images.length - 1]

  const promptUsed = chosen?.prompt || approval.content?.prompt || ''

  const [notes, setNotes] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)

  const queryClient = useQueryClient()
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!approval.resume_url) throw new Error('No resume_url on approval row')
      return apiPost(approval.resume_url, { image_notes: notes.trim() })
    },
    onSuccess: () => {
      toast.notify('Image approved — moving to CMS publishing…')
      queryClient.invalidateQueries({ queryKey: ['pending-images'] })
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const dataUrl = chosen
    ? `data:${chosen.mime_type};base64,${chosen.image_b64}`
    : null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h">
        <div>
          <div className="card-h-title">{job.topic}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>Stage 4 &middot; Image review</div>
        </div>
        <AIBadge label="Gemini Imagen 3" />
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {job.chosen_angle && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className="chip">Angle: {job.chosen_angle}</span>
            <span className="chip">16:9 hero</span>
            {chosen && <span className="chip">{chosen.generated_by}</span>}
          </div>
        )}

        {dataUrl ? (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <img
              src={dataUrl}
              alt={`Generated hero for: ${job.topic}`}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
        ) : (
          <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
            <div className="card-body" style={{ color: 'var(--red)', fontSize: 13 }}>
              No image attached to this approval. Check the API window for errors.
            </div>
          </div>
        )}

        {promptUsed && (
          <details
            open={promptOpen}
            onToggle={e => setPromptOpen((e.target as HTMLDetailsElement).open)}
            style={{ fontSize: 13 }}
          >
            <summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>
              Prompt used (click to {promptOpen ? 'hide' : 'view'})
            </summary>
            <p style={{
              margin: '8px 0 0',
              padding: 12,
              background: 'var(--ai-50)',
              borderRadius: 6,
              color: 'var(--text-2)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
            }}>
              {promptUsed}
            </p>
          </details>
        )}

        <div>
          <label className="label">
            Notes <span style={{ textTransform: 'none', color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            className="textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder='e.g. "Use this." Or describe what the next version should fix.'
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Approving advances the job to CMS publishing.
          </span>
          <button
            className="btn btn-green"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !chosen}
          >
            {mutation.isPending ? 'Approving…' : (
              <>
                <I.check size={14} sw={2.2} /> Approve image
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
