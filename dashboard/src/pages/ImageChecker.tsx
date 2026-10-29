import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { N8N_IMAGE_CHECK_URL, n8nPost, pgDelete, pgGet, pgPatch, pgPost } from '../lib/api'
import type { ImageCheck, ImageCheckStatus, ImageCheckVerdict } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

interface CheckResult {
  ok: boolean
  summary: string
  extracted_text: string
  grammar_issues: { issue: string; suggestion: string }[]
  verdict: ImageCheckVerdict
  verdict_reason: string
}

const STATUS_META: Record<ImageCheckStatus, { label: string; pill: string }> = {
  checking: { label: 'Checking…', pill: 'pill-blue' },
  completed: { label: 'Completed', pill: 'pill-green' },
  failed: { label: 'Failed', pill: 'pill-red' },
}

const VERDICT_META: Record<ImageCheckVerdict, { label: string; pill: string }> = {
  match: { label: 'Match', pill: 'pill-green' },
  partial_match: { label: 'Partial match', pill: 'pill-amber' },
  mismatch: { label: 'Mismatch', pill: 'pill-red' },
}

function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      const b64 = comma >= 0 ? result.slice(comma + 1) : result
      resolve({ b64, mime: file.type || 'image/jpeg' })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function runCheck(check: ImageCheck) {
  try {
    const data = await n8nPost(N8N_IMAGE_CHECK_URL, {
      request_text: check.request_text,
      image_b64: check.image_b64,
      mime_type: check.mime_type,
    }) as CheckResult
    if (!data.ok) throw new Error('Workflow returned no result')
    await pgPatch(`/image_checks?id=eq.${check.id}`, {
      status: 'completed',
      summary: data.summary,
      extracted_text: data.extracted_text,
      grammar_issues: data.grammar_issues,
      verdict: data.verdict,
      verdict_reason: data.verdict_reason,
      error: null,
    })
  } catch (err) {
    await pgPatch(`/image_checks?id=eq.${check.id}`, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export default function ImageChecker() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: checks = [], isLoading } = useQuery<ImageCheck[]>({
    queryKey: ['image-checks'],
    queryFn: () => pgGet<ImageCheck[]>('/image_checks?order=created_at.desc&limit=100'),
    refetchInterval: q => {
      const list = q.state.data as ImageCheck[] | undefined
      return list?.some(c => c.status === 'checking') ? 4000 : false
    },
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(checks.length === 0)

  const [requestText, setRequestText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const selected = checks.find(c => c.id === selectedId) || null

  const resetForm = () => {
    setRequestText('')
    setFile(null)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = e => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { alert('Please pick an image file.'); return }
    if (f.size > 8 * 1024 * 1024) { alert('Image over 8 MB — compress it first.'); return }
    setFile(f)
    const reader = new FileReader()
    reader.onload = ev => setPreview(String(ev.target?.result || ''))
    reader.readAsDataURL(f)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!requestText.trim() || !file) throw new Error('What-was-requested text and an image are required')
      const { b64, mime } = await fileToBase64(file)
      const rows = await pgPost<ImageCheck[]>('/image_checks', {
        request_text: requestText.trim(),
        image_b64: b64,
        mime_type: mime,
        status: 'checking',
      })
      const check = rows[0]
      queryClient.invalidateQueries({ queryKey: ['image-checks'] })
      setSelectedId(check.id)
      setShowNewForm(false)
      resetForm()
      await runCheck(check)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-checks'] }),
  })

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return
      await pgPatch(`/image_checks?id=eq.${selected.id}`, { status: 'checking', error: null })
      queryClient.invalidateQueries({ queryKey: ['image-checks'] })
      await runCheck(selected)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-checks'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/image_checks?id=eq.${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['image-checks'] })
      if (selectedId === id) setSelectedId(null)
    },
  })

  const canCreate = !!requestText.trim() && !!file && !createMutation.isPending

  return (
    <>
      <PageHeader
        title="Image Checker"
        breadcrumb={['Project Digital', 'Image Checker']}
        actions={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setShowNewForm(true); setSelectedId(null) }}
          >
            <I.plus size={13} /> New check
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, marginTop: 18, alignItems: 'start' }}>

        {/* ── Check list ──────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">Checks {checks.length > 0 && <span style={{ color: 'var(--text-3)' }}>({checks.length})</span>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 600, overflowY: 'auto' }}>
            {isLoading && (
              <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</div>
            )}
            {!isLoading && checks.length === 0 && (
              <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>
                No checks yet. Click New check to verify an image before sending it.
              </div>
            )}
            {checks.map(c => {
              const thumb = `data:${c.mime_type};base64,${c.image_b64}`
              const meta = STATUS_META[c.status]
              const verdictMeta = c.verdict ? VERDICT_META[c.verdict] : null
              const active = c.id === selectedId && !showNewForm
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setShowNewForm(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'var(--primary-50)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <img src={thumb} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.request_text}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <span className={`pill ${meta.pill}`}>{meta.label}</span>
                      {verdictMeta && <span className={`pill ${verdictMeta.pill}`}>{verdictMeta.label}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Detail / new check panel ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {showNewForm && (
            <div className="card">
              <div className="card-header">
                <I.search size={15} style={{ marginRight: 6 }} />
                Verify an image before sending
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--text-2)' }}>
                    What was requested <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <textarea
                    className="textarea"
                    placeholder="e.g. Client asked for a 4:5 static post announcing the summer sale, headline in yellow"
                    value={requestText}
                    onChange={e => setRequestText(e.target.value)}
                    rows={3}
                    style={{ width: '100%', fontSize: 13.5 }}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                    Paste the brief, the caption you were told to use, or whatever this image was supposed to fulfil —
                    the AI compares the image against this text to flag a wrong-image mismatch.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--text-2)' }}>
                    Image to verify <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onPickFile}
                    style={{ display: 'none' }}
                    id="image-check-file-input"
                  />
                  {preview ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <img
                        src={preview}
                        alt="To verify"
                        style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{file?.name}</div>
                        <label htmlFor="image-check-file-input" className="btn btn-outline btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
                          <I.image size={13} /> Change image
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="image-check-file-input"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        border: '1.5px dashed var(--border)',
                        borderRadius: 8,
                        padding: '24px 16px',
                        background: 'var(--bg-2)',
                        cursor: 'pointer',
                      }}
                    >
                      <I.fileUp size={22} stroke="var(--text-3)" />
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Choose an image</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>PNG, JPG — max 8 MB</span>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!canCreate}>
                    <I.search size={14} /> Verify
                  </button>
                  {checks.length > 0 && (
                    <button className="btn btn-ghost" onClick={() => { setShowNewForm(false); resetForm() }}>
                      Cancel
                    </button>
                  )}
                </div>
                {createMutation.isError && (
                  <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{String(createMutation.error)}</div>
                )}
              </div>
            </div>
          )}

          {!showNewForm && !selected && (
            <div className="card">
              <div className="card-body" style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
                <I.search size={26} stroke="var(--text-3)" />
                <div style={{ fontSize: 13, marginTop: 12 }}>Select a check, or start a new one.</div>
              </div>
            </div>
          )}

          {!showNewForm && selected && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selected.request_text}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => { if (window.confirm('Delete this check?')) deleteMutation.mutate(selected.id) }}
                >
                  <I.trash size={13} />
                </button>
              </div>

              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {selected.status === 'checking' && (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
                    <I.refresh size={18} style={{ display: 'block', margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                    Reading the image and checking against the request… (~15 sec)
                  </div>
                )}

                {selected.status === 'failed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: 12, background: 'var(--red-50)', border: '1px solid var(--red-100)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
                      {selected.error || 'Something went wrong.'}
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() => retryMutation.mutate()}
                      disabled={retryMutation.isPending}
                    >
                      <I.refresh size={13} /> {retryMutation.isPending ? 'Retrying…' : 'Retry'}
                    </button>
                  </div>
                )}

                {selected.status === 'completed' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 300px) 1fr', gap: 28, alignItems: 'start' }}>
                    <img
                      src={`data:${selected.mime_type};base64,${selected.image_b64}`}
                      alt="Checked"
                      style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {selected.verdict && (
                        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span className={`pill ${VERDICT_META[selected.verdict].pill}`}>{VERDICT_META[selected.verdict].label}</span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{selected.verdict_reason}</div>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                          What's in the image
                        </div>
                        <div style={{ fontSize: 13.5 }}>{selected.summary || '—'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                          Text found in image
                        </div>
                        <div style={{ fontSize: 13.5, fontStyle: selected.extracted_text ? 'normal' : 'italic', color: selected.extracted_text ? 'var(--text)' : 'var(--text-3)' }}>
                          {selected.extracted_text || 'No text detected'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>
                          Grammar / spelling
                        </div>
                        {(selected.grammar_issues || []).length === 0 ? (
                          <div style={{ fontSize: 13, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <I.check size={14} /> No issues found
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {(selected.grammar_issues || []).map((g, idx) => (
                              <div key={idx} style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
                                <div style={{ color: 'var(--red)' }}>{g.issue}</div>
                                <div style={{ color: 'var(--text-2)', marginTop: 2 }}>Suggestion: {g.suggestion}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
