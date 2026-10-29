import { useQuery } from '@tanstack/react-query'
import { pgGet } from '../lib/api'
import type { GuidelineItem } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

interface Props {
  id: string
  onBack: () => void
}

export default function GuidelineDetail({ id, onBack }: Props) {
  const { data, isLoading, error } = useQuery<GuidelineItem[]>({
    queryKey: ['guideline-item', id],
    queryFn: () => pgGet<GuidelineItem[]>(`/guideline_items?id=eq.${id}`),
  })
  const item = data?.[0]

  return (
    <>
      <PageHeader
        title={item?.title || 'Guideline'}
        breadcrumb={['Project Digital', 'Guidelines', item?.title || '...']}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <I.arrowRight size={13} style={{ transform: 'rotate(180deg)' }} /> Back
          </button>
        }
      />

      <div style={{ marginTop: 18 }}>
        {isLoading && <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading…</div></div>}
        {error && (
          <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
            <div className="card-body" style={{ color: 'var(--red)', fontSize: 13 }}>Failed to load: <span className="mono">{String(error)}</span></div>
          </div>
        )}
        {!isLoading && !item && !error && (
          <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Guideline not found.</div></div>
        )}

        {item && (
          <div className="card">
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="pill pill-slate">{item.category}</span>
                <span className="pill pill-purple">{item.source_type}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 6 }}>
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>

              {item.source_url && (
                <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
                  {item.source_url}
                </a>
              )}

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Narration</div>
                {item.audio_b64 ? (
                  <audio controls style={{ width: '100%' }} src={`data:${item.audio_mime_type || 'audio/mpeg'};base64,${item.audio_b64}`} />
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No audio generated for this item.</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Summary</div>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6 }}>
                  {item.ai_summary || 'No summary generated.'}
                </p>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Full text</div>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {item.extracted_text || 'No text extracted.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
