import { useQuery } from '@tanstack/react-query'
import { pgGet } from '../lib/api'
import type { ContentJob } from '../lib/types'

interface JobWithApprovals extends ContentJob {
  approval_stages?: { stage_number: number; status: string }[]
}

const PROCESSING_META: Record<string, { label: string; eta: string }> = {
  research: { label: 'Researching',        eta: '~20s' },
  outline:  { label: 'Generating outline', eta: '~30s' },
  drafting: { label: 'Writing draft',      eta: '~60s' },
  image:    { label: 'Generating image',   eta: '~30s' },
}

const PROCESSING_STATUSES = Object.keys(PROCESSING_META)

export default function ProcessingJobs() {
  const { data } = useQuery<JobWithApprovals[]>({
    queryKey: ['processing-jobs'],
    queryFn: () =>
      pgGet<JobWithApprovals[]>(
        `/content_jobs?status=in.(${PROCESSING_STATUSES.join(',')})&select=*,approval_stages(stage_number,status)&order=updated_at.desc`,
      ),
  })

  // A job is "processing" (Claude is generating the next artifact) when its
  // status is a working state but no approval row is pending yet — i.e. it's
  // between gates, not waiting on the human.
  const processing = (data || []).filter(
    j => !(j.approval_stages || []).some(a => a.status === 'pending'),
  )

  if (processing.length === 0) return null

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Processing</h2>
        <span className="pill pill-blue"><span className="pill-dot" />{processing.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {processing.map(j => {
          const meta = PROCESSING_META[j.status] || { label: 'Working', eta: '' }
          return (
            <div key={j.id} className="card">
              <div
                className="card-body"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}
              >
                <span className="pill pill-blue" style={{ flexShrink: 0 }}>
                  <span className="pill-dot" />
                  {meta.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {j.topic}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                    Claude is working{meta.eta ? ` · ${meta.eta}` : ''} · this card clears when it's ready to review
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
