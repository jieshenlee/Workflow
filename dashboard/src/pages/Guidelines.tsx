import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { N8N_GUIDELINE_CONFIRM_URL, N8N_GUIDELINE_UPLOAD_URL, pgDelete, pgGet } from '../lib/api'
import type { GuidelineItem, GuidelineSourceType } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const SOURCE_LABELS: Record<GuidelineSourceType, string> = {
  pdf: 'PDF',
  screenshot: 'Screenshot',
  blog: 'Blog URL',
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(f)
  })
}

export default function Guidelines() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [sourceType, setSourceType] = useState<GuidelineSourceType>('pdf')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [blogUrl, setBlogUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{ title: string; category: string; summary: string } | null>(null)
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: pending = [], isLoading: pendingLoading } = useQuery<GuidelineItem[]>({
    queryKey: ['guideline-items', 'pending_review'],
    queryFn: () => pgGet<GuidelineItem[]>('/guideline_items?status=eq.pending_review&order=created_at.desc'),
  })

  const { data: published = [], isLoading: publishedLoading } = useQuery<GuidelineItem[]>({
    queryKey: ['guideline-items', 'published'],
    queryFn: () => pgGet<GuidelineItem[]>('/guideline_items?status=eq.published&order=created_at.desc&limit=200'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/guideline_items?id=eq.${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-items'] })
    },
  })

  function resetUploadForm() {
    setFile(null)
    setBlogUrl('')
    setTitle('')
  }

  function pickFile(f: File | null) {
    setFile(f)
    setUploadResult(null)
    setUploadError(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  async function handleUpload() {
    const isFileSource = sourceType === 'pdf' || sourceType === 'screenshot'
    if (isFileSource && !file) return
    if (sourceType === 'blog' && !blogUrl.trim()) return
    if (isFileSource && file && file.size > MAX_FILE_BYTES) {
      setUploadError('File too large — max 10 MB')
      return
    }
    setUploading(true)
    setUploadError(null)
    setUploadResult(null)
    try {
      const body: Record<string, unknown> = { source_type: sourceType, title }
      if (isFileSource && file) {
        body.file_b64 = await fileToBase64(file)
        body.mime_type = file.type || (sourceType === 'pdf' ? 'application/pdf' : 'image/jpeg')
      } else {
        body.source_url = blogUrl.trim()
      }
      const res = await fetch(N8N_GUIDELINE_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`n8n responded ${res.status} — is the workflow active?`)
      const result = await res.json()
      setUploadResult(result)
      resetUploadForm()
      queryClient.invalidateQueries({ queryKey: ['guideline-items'] })
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirm(item: GuidelineItem) {
    const category = (categoryDrafts[item.id] ?? item.ai_category ?? '').trim()
    if (!category) return
    setConfirmingId(item.id)
    try {
      const res = await fetch(N8N_GUIDELINE_CONFIRM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, category, summary: item.ai_summary || '' }),
      })
      if (!res.ok) throw new Error(`n8n responded ${res.status} — is the workflow active?`)
      queryClient.invalidateQueries({ queryKey: ['guideline-items'] })
    } catch (e: any) {
      window.alert(`Confirm failed: ${e.message}`)
    } finally {
      setConfirmingId(null)
    }
  }

  function handleDelete(item: GuidelineItem) {
    if (window.confirm(`Delete "${item.title}"?`)) deleteMutation.mutate(item.id)
  }

  return (
    <>
      <PageHeader title="Guidelines" breadcrumb={['Project Digital', 'Guidelines']} />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Upload panel */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Add a guideline</div>

            <div className="tabs">
              {(['pdf', 'screenshot', 'blog'] as GuidelineSourceType[]).map(t => (
                <button
                  key={t}
                  className={`tab ${sourceType === t ? 'active' : ''}`}
                  onClick={() => { setSourceType(t); pickFile(null); setBlogUrl('') }}
                >
                  {SOURCE_LABELS[t]}
                </button>
              ))}
            </div>

            <input
              className="input"
              placeholder="Title (optional — AI will suggest one if left blank)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ fontSize: 13 }}
            />

            {sourceType === 'blog' ? (
              <input
                className="input"
                placeholder="https://example.com/blog/post"
                value={blogUrl}
                onChange={e => setBlogUrl(e.target.value)}
                style={{ fontSize: 13 }}
              />
            ) : !file ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '28px 24px', borderRadius: 8, cursor: 'pointer',
                  border: `2px dashed ${dragOver ? 'var(--ai)' : 'var(--border)'}`,
                  background: dragOver ? 'var(--ai-50)' : 'transparent',
                  color: 'var(--text-3)', transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={sourceType === 'pdf' ? 'application/pdf' : 'image/*'}
                  style={{ display: 'none' }}
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                />
                <I.fileUp size={22} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Drop a {sourceType === 'pdf' ? 'PDF' : 'screenshot'}, or click to browse
                </span>
                <span style={{ fontSize: 11 }}>Up to 10 MB</span>
                {sourceType === 'pdf' && (
                  <span style={{ fontSize: 11 }}>Have a PowerPoint? Export it to PDF first (File → Export → Create PDF).</span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <I.fileText size={18} />
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => pickFile(null)} disabled={uploading}>Change</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleUpload}
                disabled={uploading || (sourceType === 'blog' ? !blogUrl.trim() : !file)}
              >
                {uploading ? 'Analyzing…' : 'Upload & analyze'}
              </button>
            </div>

            {uploadError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{uploadError}</div>}
            {uploadResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#16a34a' }}>
                <I.check size={14} />
                &ldquo;{uploadResult.title}&rdquo; tagged &ldquo;{uploadResult.category}&rdquo; — awaiting confirmation below.
              </div>
            )}
          </div>
        </div>

        {/* Pending review */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Pending review {pending.length > 0 && <span style={{ color: 'var(--text-3)' }}>({pending.length})</span>}
            </div>
            {pendingLoading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>}
            {!pendingLoading && pending.length === 0 && (
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nothing waiting on a category confirmation.</div>
            )}
            {pending.map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span className="pill pill-slate" style={{ fontSize: 10 }}>{SOURCE_LABELS[item.source_type]}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
                    {item.ai_summary || 'No summary generated.'}
                  </p>
                </div>
                <input
                  className="input"
                  style={{ width: 200, fontSize: 12.5 }}
                  value={categoryDrafts[item.id] ?? item.ai_category ?? ''}
                  onChange={e => setCategoryDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                  placeholder="Category"
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleConfirm(item)}
                  disabled={confirmingId === item.id}
                >
                  {confirmingId === item.id ? 'Confirming…' : 'Confirm'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(item)} style={{ color: 'var(--red)' }}>
                  <I.trash size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Library */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
            Library {published.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({published.length})</span>}
          </div>
          {publishedLoading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>}
          {!publishedLoading && published.length === 0 && (
            <div className="card">
              <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>
                No published guidelines yet.
              </div>
            </div>
          )}
          {published.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {published.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(`/guidelines/${item.id}`)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', cursor: 'pointer',
                    padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <I.fileText size={16} />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{item.title}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.ai_summary}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="pill pill-slate" style={{ fontSize: 10 }}>{item.category}</span>
                    <span className="pill pill-purple" style={{ fontSize: 10 }}>{SOURCE_LABELS[item.source_type]}</span>
                    {item.audio_b64 && <span className="pill pill-teal" style={{ fontSize: 10 }}>Audio</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
