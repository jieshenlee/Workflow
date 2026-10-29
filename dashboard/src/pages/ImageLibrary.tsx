import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pgDelete, pgGet } from '../lib/api'
import type { LibraryImage, ImageSource } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { ImageUploader } from '../components/ui/ImageUploader'
import { I } from '../components/ui/Icon'

type Filter = 'all' | ImageSource

export default function ImageLibrary() {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<LibraryImage | null>(null)

  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<LibraryImage[]>({
    queryKey: ['library-images'],
    queryFn: () => pgGet<LibraryImage[]>('/images?order=created_at.desc&limit=200'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/images?id=eq.${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-images'] })
      queryClient.invalidateQueries({ queryKey: ['recent-library-images'] })
      setSelected(null)
    },
  })

  const handleDelete = (img: LibraryImage) => {
    const ok = window.confirm(
      `Delete this image?\n\nJobs that picked this image will lose it (chosen_image_id is set to NULL on delete).`,
    )
    if (ok) deleteMutation.mutate(img.id)
  }

  const all = data ?? []
  const filtered = filter === 'all' ? all : all.filter(i => i.source === filter)
  const counts = {
    all: all.length,
    ai_generated: all.filter(i => i.source === 'ai_generated').length,
    upload: all.filter(i => i.source === 'upload').length,
  }

  return (
    <>
      <PageHeader title="Image Library" breadcrumb={['Project Digital', 'Image Library']} />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ImageUploader variant="block" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tabs">
            {([
              ['all', 'All', counts.all],
              ['ai_generated', 'AI-generated', counts.ai_generated],
              ['upload', 'Uploaded', counts.upload],
            ] as Array<[Filter, string, number]>).map(([k, label, n]) => (
              <button
                key={k}
                className={`tab ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {label}{' '}
                <span style={{ color: 'var(--text-3)', marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {n}
                </span>
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="card"><div className="card-body" style={{ color: 'var(--text-3)' }}>Loading library…</div></div>
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
              {filter === 'all'
                ? 'No images yet. Upload one above, or approve a draft to generate one.'
                : `No ${filter === 'ai_generated' ? 'AI-generated' : 'uploaded'} images yet.`}
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            {filtered.map(img => (
              <button
                key={img.id}
                onClick={() => setSelected(img)}
                style={{
                  position: 'relative',
                  padding: 0,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--bg-2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                title={img.title || img.prompt || ''}
              >
                <img
                  src={`data:${img.mime_type};base64,${img.image_b64}`}
                  alt={img.title || 'library image'}
                  style={{ display: 'block', width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
                />
                <div style={{ padding: '8px 10px', fontSize: 11.5 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {img.title || (img.source === 'ai_generated' ? 'Generated image' : 'Untitled')}
                  </div>
                  <div style={{ color: 'var(--text-3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`pill ${img.source === 'ai_generated' ? 'pill-purple' : 'pill-teal'}`} style={{ fontSize: 10 }}>
                      {img.source === 'ai_generated' ? 'AI' : 'Upload'}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {new Date(img.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 12,
              maxWidth: 900,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {selected.title || (selected.source === 'ai_generated' ? 'Generated image' : 'Untitled')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                  {selected.source === 'ai_generated' ? 'AI-generated' : 'Uploaded'} ·{' '}
                  {selected.generated_by || 'unknown source'} ·{' '}
                  {new Date(selected.created_at).toLocaleString()}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelected(null)}
                style={{ color: 'var(--text-3)' }}
              >
                Close
              </button>
            </div>

            <img
              src={`data:${selected.mime_type};base64,${selected.image_b64}`}
              alt={selected.title || ''}
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
            />

            {selected.prompt && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}>
                  Prompt used
                </summary>
                <p
                  style={{
                    margin: '8px 0 0',
                    padding: 12,
                    background: 'var(--ai-50)',
                    borderRadius: 6,
                    color: 'var(--text-2)',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {selected.prompt}
                </p>
              </details>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDelete(selected)}
                style={{ color: 'var(--red)' }}
                disabled={deleteMutation.isPending}
              >
                <I.trash size={13} /> Delete image
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
