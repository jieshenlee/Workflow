import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_IMAGE_MAKER_URL, apiPost, pgDelete, pgGet, pgPatch, pgPost } from '../lib/api'
import type { ImageMakerProject, ImageMakerStatus } from '../lib/types'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

interface GenerateResult {
  ok: boolean
  image_b64: string
  mime_type: string
  slogans: string[]
}

const STATUS_META: Record<ImageMakerStatus, { label: string; pill: string }> = {
  generating: { label: 'Generating…', pill: 'pill-blue' },
  completed: { label: 'Completed', pill: 'pill-green' },
  failed: { label: 'Failed', pill: 'pill-red' },
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

async function runGeneration(project: ImageMakerProject) {
  try {
    const data = await apiPost(API_IMAGE_MAKER_URL, {
      instruction: project.instruction,
      reference_image_b64: project.reference_image_b64,
      reference_mime_type: project.reference_mime_type,
    }) as GenerateResult
    if (!data.ok || !data.image_b64) throw new Error('Workflow returned no image')
    await pgPatch(`/image_maker_projects?id=eq.${project.id}`, {
      status: 'completed',
      generated_image_b64: data.image_b64,
      generated_mime_type: data.mime_type,
      slogans: data.slogans,
      error: null,
    })
  } catch (err) {
    await pgPatch(`/image_maker_projects?id=eq.${project.id}`, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export default function ImageMaker() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: projects = [], isLoading } = useQuery<ImageMakerProject[]>({
    queryKey: ['image-maker-projects'],
    queryFn: () => pgGet<ImageMakerProject[]>('/image_maker_projects?order=created_at.desc&limit=100'),
    refetchInterval: q => {
      const list = q.state.data as ImageMakerProject[] | undefined
      return list?.some(p => p.status === 'generating') ? 4000 : false
    },
  })

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(projects.length === 0)

  const [instruction, setInstruction] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreview, setReferencePreview] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const selected = projects.find(p => p.id === selectedProjectId) || null

  const resetForm = () => {
    setInstruction('')
    setReferenceFile(null)
    setReferencePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = e => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { alert('Please pick an image file.'); return }
    if (f.size > 8 * 1024 * 1024) { alert('Image over 8 MB — compress it first.'); return }
    setReferenceFile(f)
    const reader = new FileReader()
    reader.onload = ev => setReferencePreview(String(ev.target?.result || ''))
    reader.readAsDataURL(f)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!instruction.trim() || !referenceFile) throw new Error('Instruction and reference image are required')
      const { b64, mime } = await fileToBase64(referenceFile)
      const rows = await pgPost<ImageMakerProject[]>('/image_maker_projects', {
        instruction: instruction.trim(),
        reference_image_b64: b64,
        reference_mime_type: mime,
        status: 'generating',
      })
      const project = rows[0]
      queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] })
      setSelectedProjectId(project.id)
      setShowNewForm(false)
      resetForm()
      await runGeneration(project)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] }),
  })

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return
      await pgPatch(`/image_maker_projects?id=eq.${selected.id}`, { status: 'generating', error: null })
      queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] })
      await runGeneration(selected)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] }),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !selected.generated_image_b64) throw new Error('No image to save')
      const rows = await pgPost<{ id: string }[]>('/images', {
        source: 'ai_generated',
        prompt: selected.instruction,
        image_b64: selected.generated_image_b64,
        mime_type: selected.generated_mime_type || 'image/png',
        title: `Image Maker: ${selected.instruction}`,
        generated_by: 'gemini-2.5-flash-image',
        metadata: { instruction: selected.instruction, slogans: selected.slogans },
      })
      await pgPatch(`/image_maker_projects?id=eq.${selected.id}`, {
        saved_to_library: true,
        library_image_id: rows[0].id,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] })
      queryClient.invalidateQueries({ queryKey: ['library-images'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/image_maker_projects?id=eq.${id}`),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['image-maker-projects'] })
      if (selectedProjectId === id) setSelectedProjectId(null)
    },
  })

  const handleDownload = () => {
    if (!selected?.generated_image_b64) return
    const a = document.createElement('a')
    a.href = `data:${selected.generated_mime_type || 'image/png'};base64,${selected.generated_image_b64}`
    a.download = `image-maker-${selected.instruction.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}.png`
    a.click()
  }

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(idx)
      setTimeout(() => setCopied(c => (c === idx ? null : c)), 1500)
    } catch {
      // clipboard blocked
    }
  }

  const canCreate = !!instruction.trim() && !!referenceFile && !createMutation.isPending

  return (
    <>
      <PageHeader
        title="Image Maker"
        breadcrumb={['Project Digital', 'Image Maker']}
        actions={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setShowNewForm(true); setSelectedProjectId(null) }}
          >
            <I.plus size={13} /> New project
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, marginTop: 18, alignItems: 'start' }}>

        {/* ── Project list ──────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">Projects {projects.length > 0 && <span style={{ color: 'var(--text-3)' }}>({projects.length})</span>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 600, overflowY: 'auto' }}>
            {isLoading && (
              <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</div>
            )}
            {!isLoading && projects.length === 0 && (
              <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>
                No projects yet. Click New project to start.
              </div>
            )}
            {projects.map(p => {
              const thumb = p.generated_image_b64
                ? `data:${p.generated_mime_type || 'image/png'};base64,${p.generated_image_b64}`
                : `data:${p.reference_mime_type};base64,${p.reference_image_b64}`
              const meta = STATUS_META[p.status]
              const active = p.id === selectedProjectId && !showNewForm
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProjectId(p.id); setShowNewForm(false) }}
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
                      {p.instruction}
                    </div>
                    <span className={`pill ${meta.pill}`} style={{ marginTop: 4 }}>{meta.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Detail / new project panel ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {showNewForm && (
            <div className="card">
              <div className="card-header">
                <I.wand size={15} style={{ marginRight: 6 }} />
                Create branded image
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--text-2)' }}>
                    Instruction <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <textarea
                    className="textarea"
                    placeholder="e.g. I need a yellow version of this"
                    value={instruction}
                    onChange={e => setInstruction(e.target.value)}
                    rows={2}
                    style={{ width: '100%', fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--text-2)' }}>
                    Reference image <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onPickFile}
                    style={{ display: 'none' }}
                    id="image-maker-file-input"
                  />
                  {referencePreview ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <img
                        src={referencePreview}
                        alt="Reference"
                        style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{referenceFile?.name}</div>
                        <label htmlFor="image-maker-file-input" className="btn btn-outline btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
                          <I.image size={13} /> Change image
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="image-maker-file-input"
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
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Choose a reference image</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>PNG, JPG — max 8 MB</span>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!canCreate}>
                    <I.sparkle size={14} /> Generate
                  </button>
                  {projects.length > 0 && (
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
                <I.wand size={26} stroke="var(--text-3)" />
                <div style={{ fontSize: 13, marginTop: 12 }}>Select a project, or start a new one.</div>
              </div>
            </div>
          )}

          {!showNewForm && selected && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selected.instruction}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)' }}
                  onClick={() => { if (window.confirm('Delete this project?')) deleteMutation.mutate(selected.id) }}
                >
                  <I.trash size={13} />
                </button>
              </div>

              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {selected.status === 'generating' && (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
                    <I.refresh size={18} style={{ display: 'block', margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                    Editing the image and writing slogans… (~15 sec)
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

                {selected.status === 'completed' && selected.generated_image_b64 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 340px) 1fr', gap: 28, alignItems: 'start' }}>
                    <div>
                      <img
                        src={`data:${selected.generated_mime_type || 'image/png'};base64,${selected.generated_image_b64}`}
                        alt="Generated"
                        style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', display: 'block' }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                          <I.download size={13} /> Download
                        </button>
                        {selected.saved_to_library ? (
                          <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
                            <I.check size={13} /> Saved to library
                          </span>
                        ) : (
                          <button className="btn btn-outline btn-sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? 'Saving…' : 'Save to library'}
                          </button>
                        )}
                      </div>
                      {saveMutation.isError && (
                        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>Save failed: {String(saveMutation.error)}</div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                        Slogans
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(selected.slogans || []).map((slogan, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{slogan}</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(slogan, idx)} style={{ padding: '4px 6px', color: copied === idx ? 'var(--green)' : 'var(--text-3)' }}>
                              {copied === idx ? <I.check size={13} /> : <I.copy size={13} />}
                            </button>
                          </div>
                        ))}
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
