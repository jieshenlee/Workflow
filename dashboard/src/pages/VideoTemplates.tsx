import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_VIDEO_TEMPLATE_URL, pgDelete, pgGet } from '../lib/api'
import { exportChecklistExcel, exportChecklistPptx } from '../lib/export'
import type { ChecklistItem, VideoTemplate, VideoTemplateMode } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

const BRAND_COLOR_KEY = 'pd-video-template-brand-color'
const DEFAULT_BRAND_COLOR = '#4F46E5'

const MODE_LABELS: Record<VideoTemplateMode, string> = {
  flowchart: 'Tutorial → Flowchart',
  checklist: 'Video → Checklist',
}

function loadBrandColor(): string {
  try {
    return window.localStorage.getItem(BRAND_COLOR_KEY) || DEFAULT_BRAND_COLOR
  } catch {
    return DEFAULT_BRAND_COLOR
  }
}

function saveBrandColor(color: string) {
  try {
    window.localStorage.setItem(BRAND_COLOR_KEY, color)
  } catch {
    // per-viewer convenience only — fine if storage is unavailable
  }
}

function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRenderError(null)
    ;(async () => {
      try {
        const mod: any = await import('mermaid')
        const mermaid = mod.default ?? mod
        mermaid.initialize({ startOnLoad: false, theme: 'neutral' })
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code)
        if (!cancelled && containerRef.current) containerRef.current.innerHTML = svg
      } catch (e: any) {
        if (!cancelled) setRenderError(e?.message || 'Could not render this diagram')
      }
    })()
    return () => { cancelled = true }
  }, [code])

  if (renderError) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--red)' }}>
        Failed to render diagram: {renderError}
      </div>
    )
  }
  return <div ref={containerRef} style={{ overflowX: 'auto' }} />
}

export default function VideoTemplates() {
  const queryClient = useQueryClient()

  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [mode, setMode] = useState<VideoTemplateMode>('flowchart')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoTemplate | null>(null)
  const [checklistDraft, setChecklistDraft] = useState<ChecklistItem[]>([])
  const [brandColor, setBrandColor] = useState(loadBrandColor)
  const [exporting, setExporting] = useState<'excel' | 'pptx' | null>(null)

  const { data: history = [], isLoading: historyLoading } = useQuery<VideoTemplate[]>({
    queryKey: ['video-templates'],
    queryFn: () => pgGet<VideoTemplate[]>('/video_templates?order=created_at.desc&limit=50'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/video_templates?id=eq.${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-templates'] })
    },
  })

  useEffect(() => {
    setChecklistDraft(result?.checklist_json ? result.checklist_json.map(i => ({ ...i })) : [])
  }, [result?.id])

  function applyBrandColor(color: string) {
    setBrandColor(color)
    saveBrandColor(color)
  }

  async function handleGenerate() {
    const url = youtubeUrl.trim()
    if (!url) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(API_VIDEO_TEMPLATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: url, mode }),
      })
      if (!res.ok) throw new Error(`API responded ${res.status}: ${await res.text().catch(() => '')}`)
      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('API returned an invalid response — check docker compose logs api.')
      }
      if (!data.success) throw new Error(data.error || 'Gemini could not extract a template from this video')
      setResult({
        id: data.id,
        youtube_url: url,
        mode: data.mode,
        title: data.title,
        ai_summary: data.summary ?? null,
        mermaid_code: data.mermaid ?? null,
        checklist_json: data.checklist ?? null,
        status: data.status,
        error_message: data.error ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setYoutubeUrl('')
      queryClient.invalidateQueries({ queryKey: ['video-templates'] })
    } catch (e: any) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  function updateChecklistItem(index: number, field: keyof ChecklistItem, value: string) {
    setChecklistDraft(items => items.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function removeChecklistItem(index: number) {
    setChecklistDraft(items => items.filter((_, i) => i !== index))
  }

  function addChecklistItem() {
    setChecklistDraft(items => [...items, { step: '', detail: '' }])
  }

  async function handleExport(kind: 'excel' | 'pptx') {
    if (!result) return
    setExporting(kind)
    try {
      const baseName = (result.title || 'checklist').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'checklist'
      if (kind === 'excel') {
        await exportChecklistExcel(checklistDraft, result.title, brandColor, baseName)
      } else {
        await exportChecklistPptx(checklistDraft, result.title, brandColor, baseName)
      }
    } catch (e: any) {
      window.alert(`Export failed: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  function loadFromHistory(item: VideoTemplate) {
    setResult(item)
    setMode(item.mode)
  }

  function handleDelete(item: VideoTemplate) {
    if (!window.confirm(`Delete "${item.title}"?`)) return
    if (result?.id === item.id) setResult(null)
    deleteMutation.mutate(item.id)
  }

  return (
    <>
      <PageHeader title="Video Templates" breadcrumb={['Project Digital', 'Video Templates']} />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Input panel */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Extract from a YouTube video</div>

            <input
              className="input"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              style={{ fontSize: 13 }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              {(['flowchart', 'checklist'] as VideoTemplateMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${mode === m ? 'var(--ai)' : 'var(--border)'}`,
                    background: mode === m ? 'var(--ai-50)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{MODE_LABELS[m]}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {m === 'flowchart'
                      ? 'Renders as a Mermaid diagram right here in the dashboard.'
                      : 'Editable list — download as an Excel sheet or a PowerPoint deck.'}
                  </div>
                </button>
              ))}
            </div>

            <div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerate}
                disabled={submitting || !youtubeUrl.trim()}
              >
                {submitting ? 'Analyzing video…' : 'Generate'}
              </button>
            </div>

            {submitting && (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Gemini is watching the video — this can take 30–90 seconds for longer tutorials.
              </div>
            )}
            {submitError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{submitError}</div>}
          </div>
        </div>

        {/* Result panel */}
        {result && (
          <div className="card">
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="pill pill-purple" style={{ fontSize: 10 }}>{MODE_LABELS[result.mode]}</span>
                {result.status === 'failed' && <span className="pill pill-slate" style={{ fontSize: 10, color: 'var(--red)' }}>Failed</span>}
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{result.title}</span>
              </div>
              {result.ai_summary && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>{result.ai_summary}</p>
              )}

              {result.status === 'failed' && (
                <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{result.error_message}</div>
              )}

              {result.mode === 'flowchart' && result.mermaid_code && (
                <>
                  <MermaidDiagram code={result.mermaid_code} />
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-3)' }}>Mermaid source</summary>
                    <pre style={{ fontSize: 11.5, background: 'var(--bg-2)', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                      {result.mermaid_code}
                    </pre>
                  </details>
                  <div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => navigator.clipboard.writeText(result.mermaid_code || '')}
                    >
                      <I.copy size={13} /> Copy Mermaid code
                    </button>
                  </div>
                </>
              )}

              {result.mode === 'checklist' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {checklistDraft.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', width: 20, paddingTop: 8 }}>{i + 1}.</span>
                        <input
                          className="input"
                          style={{ flex: '0 0 240px', fontSize: 12.5 }}
                          value={item.step}
                          onChange={e => updateChecklistItem(i, 'step', e.target.value)}
                          placeholder="Step"
                        />
                        <input
                          className="input"
                          style={{ flex: 1, fontSize: 12.5 }}
                          value={item.detail}
                          onChange={e => updateChecklistItem(i, 'detail', e.target.value)}
                          placeholder="Detail"
                        />
                        <button className="btn btn-ghost btn-sm" onClick={() => removeChecklistItem(i)} style={{ color: 'var(--red)' }}>
                          <I.trash size={13} />
                        </button>
                      </div>
                    ))}
                    <div>
                      <button className="btn btn-ghost btn-sm" onClick={addChecklistItem}>
                        <I.plus size={13} /> Add step
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                      Brand color
                      <input
                        type="color"
                        value={brandColor}
                        onChange={e => applyBrandColor(e.target.value)}
                        style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }}
                      />
                    </label>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleExport('excel')}
                      disabled={exporting !== null || checklistDraft.length === 0}
                    >
                      <I.download size={13} /> {exporting === 'excel' ? 'Exporting…' : 'Download Excel'}
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleExport('pptx')}
                      disabled={exporting !== null || checklistDraft.length === 0}
                    >
                      <I.download size={13} /> {exporting === 'pptx' ? 'Exporting…' : 'Download PPT'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* History */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
            History {history.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({history.length})</span>}
          </div>
          {historyLoading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>}
          {!historyLoading && history.length === 0 && (
            <div className="card">
              <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>
                No video templates yet.
              </div>
            </div>
          )}
          {history.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {history.map(item => (
                <div
                  key={item.id}
                  style={{
                    position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
                    padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)',
                  }}
                >
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={deleteMutation.isPending}
                    title="Delete"
                    style={{
                      position: 'absolute', top: 8, right: 8, padding: 5, border: 'none',
                      background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', lineHeight: 0,
                    }}
                  >
                    <I.trash size={13} />
                  </button>
                  <button
                    onClick={() => loadFromHistory(item)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', cursor: 'pointer',
                      background: 'transparent', border: 'none', padding: 0, paddingRight: 20, font: 'inherit', color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <I.workflow size={16} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.ai_summary}
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="pill pill-purple" style={{ fontSize: 10 }}>{MODE_LABELS[item.mode]}</span>
                      {item.status === 'failed' && <span className="pill pill-slate" style={{ fontSize: 10, color: 'var(--red)' }}>Failed</span>}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
