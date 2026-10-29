import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_INSPIRATION_UPLOAD_URL, pgDelete, pgGet } from '../lib/api'
import type { InspirationCategory, InspirationItem, InspirationType } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

type TypeFilter = 'all' | InspirationType
type CategoryFilter = 'all' | InspirationCategory

const CATEGORY_LABELS: Record<InspirationCategory, string> = {
  tv_shows: 'TV Shows',
  streaming: 'Streaming',
  gadgets: 'Gadgets',
  tools: 'Tools',
  games: 'Games',
  movies: 'Movies',
  ai: 'AI',
  anime: 'Anime',
  esports: 'Esports',
  other: 'Other',
}

const CATEGORY_ORDER: InspirationCategory[] = [
  'tv_shows', 'streaming', 'gadgets', 'tools', 'games', 'movies', 'ai', 'anime', 'esports', 'other',
]

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 20 * 1024 * 1024

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(f)
  })
}

function extractVideoFrame(f: File): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(f)
    video.src = url
    video.muted = true
    video.playsInline = true
    const cleanup = () => URL.revokeObjectURL(url)
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1)
    })
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      const w = Math.min(video.videoWidth || 640, 800)
      const h = Math.round(w * ((video.videoHeight || 360) / (video.videoWidth || 640)))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { cleanup(); resolve(null); return }
      ctx.drawImage(video, 0, 0, w, h)
      cleanup()
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1])
    })
    video.addEventListener('error', () => { cleanup(); resolve(null) })
  })
}

export default function Inspiration() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [selected, setSelected] = useState<InspirationItem | null>(null)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<{ category: string; summary: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<InspirationItem[]>({
    queryKey: ['inspiration-items'],
    queryFn: () => pgGet<InspirationItem[]>('/inspiration_items?order=created_at.desc&limit=300'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/inspiration_items?id=eq.${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspiration-items'] })
      setSelected(null)
    },
  })

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setUploadResult(null)
    setUploadError(null)
    setCaption('')
    setPreviewUrl(f ? URL.createObjectURL(f) : null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  async function handleUpload() {
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size > limit) {
      setUploadError(`File too large — max ${isVideo ? '20' : '5'} MB`)
      return
    }
    setUploading(true)
    setUploadError(null)
    setUploadResult(null)
    try {
      const file_b64 = await fileToBase64(file)
      let preview_b64: string | null = null
      let preview_mime_type: string | null = null
      if (isVideo) {
        preview_b64 = await extractVideoFrame(file)
        if (preview_b64) preview_mime_type = 'image/jpeg'
      }
      const res = await fetch(API_INSPIRATION_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isVideo ? 'video' : 'image',
          file_b64,
          mime_type: file.type,
          caption,
          preview_b64,
          preview_mime_type,
        }),
      })
      if (!res.ok) throw new Error(`API responded ${res.status}: ${await res.text().catch(() => '')}`)
      const result = await res.json()
      setUploadResult(result)
      pickFile(null)
      queryClient.invalidateQueries({ queryKey: ['inspiration-items'] })
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (item: InspirationItem) => {
    if (window.confirm('Delete this inspiration item?')) deleteMutation.mutate(item.id)
  }

  const all = data ?? []
  const filtered = all.filter(
    i => (typeFilter === 'all' || i.type === typeFilter) && (categoryFilter === 'all' || i.category === categoryFilter),
  )
  const categoryCounts = CATEGORY_ORDER.reduce((acc, c) => {
    acc[c] = all.filter(i => i.category === c).length
    return acc
  }, {} as Record<InspirationCategory, number>)
  const photoCount = all.filter(i => i.type === 'image').length
  const videoCount = all.filter(i => i.type === 'video').length

  return (
    <>
      <PageHeader title="Inspiration" breadcrumb={['Project Digital', 'Inspiration']} />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Upload panel */}
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Add to library</div>

            {!file ? (
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
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                />
                <I.fileUp size={22} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Drop a photo or video, or click to browse</span>
                <span style={{ fontSize: 11 }}>Images up to 5 MB · Videos up to 20 MB</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {previewUrl && (
                  <div style={{
                    width: 108, flexShrink: 0, borderRadius: 6, overflow: 'hidden',
                    border: '1px solid var(--border)', aspectRatio: '4/5', background: '#0f0f12',
                  }}>
                    {file.type.startsWith('video/') ? (
                      <video src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                    ) : (
                      <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" />
                    )}
                  </div>
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </div>
                  <textarea
                    className="input"
                    placeholder="Caption or context (optional)"
                    rows={2}
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    style={{ resize: 'none', fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleUpload} disabled={uploading}>
                      {uploading ? 'Tagging…' : 'Upload & tag'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => pickFile(null)} disabled={uploading}>
                      Cancel
                    </button>
                  </div>
                  {uploadError && (
                    <div style={{ fontSize: 12, color: 'var(--red)' }}>{uploadError}</div>
                  )}
                </div>
              </div>
            )}

            {uploadResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#16a34a' }}>
                <I.check size={14} />
                Saved under &ldquo;{CATEGORY_LABELS[uploadResult.category as InspirationCategory] ?? uploadResult.category}&rdquo; &mdash; {uploadResult.summary}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="tabs">
            {([
              ['all', 'All', all.length],
              ['image', 'Photos', photoCount],
              ['video', 'Videos', videoCount],
            ] as Array<[TypeFilter, string, number]>).map(([k, label, n]) => (
              <button
                key={k}
                className={`tab ${typeFilter === k ? 'active' : ''}`}
                onClick={() => setTypeFilter(k)}
              >
                {label}{' '}
                <span style={{ color: 'var(--text-3)', marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </button>
            ))}
          </div>

          <select
            className="select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
            style={{ minWidth: 160 }}
          >
            <option value="all">All categories ({all.length})</option>
            {CATEGORY_ORDER.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]} ({categoryCounts[c]})</option>
            ))}
          </select>
        </div>

        {isLoading && (
          <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading inspiration library…</div></div>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
            <div className="card-body" style={{ color: 'var(--red)', fontSize: 13 }}>
              Failed to load: <span className="mono">{String(error)}</span>
            </div>
          </div>
        )}
        {data && filtered.length === 0 && (
          <div className="card">
            <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>
              {all.length === 0
                ? 'Nothing captured yet. Upload a photo or video above to seed this library.'
                : 'Nothing matches this filter.'}
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                style={{
                  position: 'relative', padding: 0, border: '1px solid var(--border)',
                  borderRadius: 8, overflow: 'hidden', background: 'var(--bg-2)',
                  cursor: 'pointer', textAlign: 'left',
                }}
                title={item.ai_summary || ''}
              >
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: '#0f0f12' }}>
                  {item.preview_b64 ? (
                    <img
                      src={`data:${item.preview_mime_type || 'image/jpeg'};base64,${item.preview_b64}`}
                      alt={item.ai_summary || 'inspiration preview'}
                      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                      <I.image size={24} />
                    </div>
                  )}
                  {item.type === 'video' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.15)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 99, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <I.play size={14} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 10px', fontSize: 11.5 }}>
                  <div style={{ color: 'var(--text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, minHeight: '2.8em' }}>
                    {item.ai_summary || 'No summary'}
                  </div>
                  <div style={{ color: 'var(--text-3)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="pill pill-slate" style={{ fontSize: 10 }}>{CATEGORY_LABELS[item.category]}</span>
                    <span className={`pill ${item.type === 'video' ? 'pill-teal' : 'pill-purple'}`} style={{ fontSize: 10 }}>
                      {item.type === 'video' ? 'Video' : 'Photo'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <span className="pill pill-slate">{CATEGORY_LABELS[selected.category]}</span>
                  <span className={`pill ${selected.type === 'video' ? 'pill-teal' : 'pill-purple'}`}>
                    {selected.type === 'video' ? 'Video' : 'Photo'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {new Date(selected.created_at).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ color: 'var(--text-3)' }}>
                Close
              </button>
            </div>

            {selected.preview_b64 && (
              <img
                src={`data:${selected.preview_mime_type || 'image/jpeg'};base64,${selected.preview_b64}`}
                alt={selected.ai_summary || ''}
                style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            )}

            {selected.type === 'video' && (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Preview is the first frame extracted at upload &mdash; the full video is not stored.
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Summary</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                {selected.ai_summary || 'No summary generated.'}
              </p>
            </div>

            {selected.ai_tags && selected.ai_tags.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.ai_tags.map(tag => (
                    <span key={tag} className="pill pill-slate" style={{ fontSize: 11 }}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {selected.source_caption && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Caption at upload</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{selected.source_caption}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDelete(selected)}
                style={{ color: 'var(--red)' }}
                disabled={deleteMutation.isPending}
              >
                <I.trash size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
