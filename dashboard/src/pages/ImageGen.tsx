import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pgDelete, pgGet, pgPatch, pgPost } from '../lib/api'
import type {
  BrandProject,
  BrandReference,
  BriefCheck,
  ImageGenGeneration,
  ImageGenJob,
  ImageGenJobStatus,
  ImageGenReviewStatus,
  ImageGenSize,
} from '../lib/types'
import {
  COST_PER_IMAGE,
  MAX_REFERENCE_BYTES,
  MAX_REFERENCES_PER_DRAFT,
  SIZES,
  SIZE_ORDER,
  cropToSize,
  dataUrl,
  draftPrompt,
  fileToBase64,
  queueJob,
  retryJob,
  slugify,
} from '../lib/imageGen'
import { PageHeader } from '../components/ui/PageHeader'
import { I } from '../components/ui/Icon'

type Tab = 'generate' | 'history' | 'brief' | 'references' | 'spend'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'generate', label: 'Generate' },
  { id: 'history', label: 'History' },
  { id: 'brief', label: 'Brief' },
  { id: 'references', label: 'References' },
  { id: 'spend', label: 'Spend' },
]

const JOB_STATUS: Record<ImageGenJobStatus, { label: string; pill: string }> = {
  queued: { label: 'Queued', pill: 'pill-slate' },
  running: { label: 'Rendering…', pill: 'pill-blue' },
  done: { label: 'Rendered', pill: 'pill-green' },
  failed: { label: 'Failed', pill: 'pill-red' },
}

const REVIEW_STATUS: Record<ImageGenReviewStatus, { label: string; pill: string }> = {
  pending: { label: 'Needs review', pill: 'pill-amber' },
  approved: { label: 'Approved', pill: 'pill-green' },
  changes: { label: 'Changes requested', pill: 'pill-red' },
  bg_only: { label: 'Background only', pill: 'pill-purple' },
  split: { label: 'Split elements', pill: 'pill-purple' },
}

const JOBS_SELECT = 'select=*,image_gen_generations(*)'

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function sortedGens(job: ImageGenJob) {
  return [...(job.image_gen_generations || [])].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
}

function needsAttention(job: ImageGenJob) {
  if (job.status === 'queued' || job.status === 'running' || job.status === 'failed') return true
  return (job.image_gen_generations || []).some(g => g.render_status === 'done' && g.review_status === 'pending')
}

function useBrandJobs(brandId: string) {
  return useQuery<ImageGenJob[]>({
    queryKey: ['image-gen-jobs', brandId],
    queryFn: () => pgGet<ImageGenJob[]>(`/image_gen_jobs?brand_id=eq.${brandId}&order=created_at.desc&limit=30&${JOBS_SELECT}`),
    refetchInterval: q => {
      const list = q.state.data as ImageGenJob[] | undefined
      return list?.some(j => j.status === 'queued' || j.status === 'running') ? 4000 : false
    },
  })
}

function useBrandRefs(brandId: string) {
  return useQuery<BrandReference[]>({
    queryKey: ['brand-refs', brandId],
    queryFn: () => pgGet<BrandReference[]>(`/brand_references?brand_id=eq.${brandId}&order=created_at.asc`),
  })
}

// ─────────────────────────────────────────────────────────────

export default function ImageGen() {
  const queryClient = useQueryClient()
  const { data: brands = [], isLoading } = useQuery<BrandProject[]>({
    queryKey: ['brand-projects'],
    queryFn: () => pgGet<BrandProject[]>('/brand_projects?order=name.asc'),
  })

  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem('image-gen-brand'))
  const [showNew, setShowNew] = useState(false)
  const [tab, setTab] = useState<Tab>('generate')

  const selected = brands.find(b => b.id === selectedId) || null

  useEffect(() => {
    if (isLoading) return
    if (!selected && brands.length > 0 && !showNew) setSelectedId(brands[0].id)
    if (brands.length === 0) setShowNew(true)
  }, [isLoading, brands, selected, showNew])

  useEffect(() => {
    if (selectedId) localStorage.setItem('image-gen-brand', selectedId)
  }, [selectedId])

  const pick = (id: string) => { setSelectedId(id); setShowNew(false); setTab('generate') }

  return (
    <>
      <PageHeader
        title="Image Gen"
        breadcrumb={['Project Digital', 'Image Gen']}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            <I.plus size={13} /> New project
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 18, marginTop: 18, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-h"><span className="card-h-title">Projects</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 600, overflowY: 'auto' }}>
            {isLoading && <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</div>}
            {!isLoading && brands.length === 0 && (
              <div style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>
                No projects yet. A project holds one brand's brief and reference images.
              </div>
            )}
            {brands.map(b => {
              const active = b.id === selectedId && !showNew
              return (
                <button
                  key={b.id}
                  onClick={() => pick(b.id)}
                  style={{
                    padding: '11px 14px',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'var(--primary-50)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                  }}
                >
                  {b.name}
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.brief ? b.brief : 'No brief yet'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {showNew && (
            <NewProjectForm
              canCancel={brands.length > 0}
              onCancel={() => setShowNew(false)}
              onCreated={b => {
                queryClient.invalidateQueries({ queryKey: ['brand-projects'] })
                setSelectedId(b.id)
                setShowNew(false)
                setTab('references')
              }}
            />
          )}

          {!showNew && selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div className="tabs">
                  {TABS.map(t => (
                    <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <DeleteProjectButton brand={selected} onDeleted={() => setSelectedId(null)} />
              </div>
              {tab === 'generate' && <GenerateTab brand={selected} onGoTo={setTab} />}
              {tab === 'history' && <HistoryTab brand={selected} />}
              {tab === 'brief' && <BriefTab key={selected.id} brand={selected} />}
              {tab === 'references' && <ReferencesTab brand={selected} />}
              {tab === 'spend' && <SpendTab brand={selected} />}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Project create / delete ─────────────────────────────────

function NewProjectForm({ canCancel, onCancel, onCreated }: {
  canCancel: boolean
  onCancel: () => void
  onCreated: (b: BrandProject) => void
}) {
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const create = useMutation({
    mutationFn: async () => {
      const rows = await pgPost<BrandProject[]>('/brand_projects', { name: name.trim(), brief: brief.trim() })
      return rows[0]
    },
    onSuccess: onCreated,
  })
  return (
    <div className="card">
      <div className="card-h"><span className="card-h-title">New project</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Brand name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pay&Go" style={{ width: '100%' }} />
        </div>
        <div>
          <label className="label">Brand brief</label>
          <textarea
            className="textarea"
            rows={5}
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="Colours, tone, do's and don'ts, logo rules, required elements… Every drafted prompt is checked against this."
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </button>
          {canCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        </div>
        {create.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{errText(create.error)}</div>}
      </div>
    </div>
  )
}

function DeleteProjectButton({ brand, onDeleted }: { brand: BrandProject; onDeleted: () => void }) {
  const queryClient = useQueryClient()
  const del = useMutation({
    mutationFn: () => pgDelete(`/brand_projects?id=eq.${brand.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-projects'] })
      onDeleted()
    },
  })
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ color: 'var(--red)' }}
      title="Delete project"
      onClick={() => {
        if (window.confirm(`Delete "${brand.name}" with all its references, jobs and images?`)) del.mutate()
      }}
    >
      <I.trash size={13} /> Delete project
    </button>
  )
}

// ── Generate tab ────────────────────────────────────────────

function GenerateTab({ brand, onGoTo }: { brand: BrandProject; onGoTo: (t: Tab) => void }) {
  const queryClient = useQueryClient()
  const { data: refs = [] } = useBrandRefs(brand.id)
  const { data: jobs = [] } = useBrandJobs(brand.id)

  const [ask, setAsk] = useState('')
  const [sizes, setSizes] = useState<ImageGenSize[]>(['post'])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<{ prompt: string; brief_check: BriefCheck } | null>(null)

  const chosenRefs = refs.filter(r => !excluded.has(r.id))
  const tooManyRefs = chosenRefs.length > MAX_REFERENCES_PER_DRAFT

  const toggleSize = (s: ImageGenSize) =>
    setSizes(cur => (cur.includes(s) ? cur.filter(x => x !== s) : SIZE_ORDER.filter(x => x === s || cur.includes(x))))
  const toggleRef = (id: string) =>
    setExcluded(cur => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const draftMutation = useMutation({
    mutationFn: () => draftPrompt({ brand, ask: ask.trim(), sizes, references: chosenRefs }),
    onSuccess: d => setDraft({ prompt: d.prompt, brief_check: d.brief_check }),
  })

  const queueMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('Draft a prompt first')
      return queueJob({
        brandId: brand.id,
        ask: ask.trim(),
        prompt: draft.prompt.trim(),
        briefCheck: draft.brief_check,
        sizes,
        referenceIds: chosenRefs.slice(0, MAX_REFERENCES_PER_DRAFT).map(r => r.id),
      })
    },
    onSuccess: () => {
      setDraft(null)
      setAsk('')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-gen-jobs', brand.id] }),
  })

  const active = jobs.filter(needsAttention)

  return (
    <>
      <div className="card">
        <div className="card-h">
          <span className="card-h-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <I.sparkle size={14} /> New image for {brand.name}
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">The ask</label>
            <textarea
              className="textarea"
              rows={2}
              value={ask}
              onChange={e => { setAsk(e.target.value); setDraft(null) }}
              placeholder="e.g. Back-to-school promo: 20% off top-ups this week"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="label">Sizes</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SIZE_ORDER.map(s => {
                const on = sizes.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleSize(s)}
                    className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline'}`}
                    title={SIZES[s].hint}
                  >
                    {on && <I.check size={12} />}
                    {SIZES[s].label}
                    <span style={{ opacity: 0.7, fontWeight: 400 }}>{SIZES[s].w}×{SIZES[s].h}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">
              References ({chosenRefs.length} of {refs.length} used)
            </label>
            {refs.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                No reference images yet — the prompt will rely on the brief alone.{' '}
                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }} onClick={() => onGoTo('references')}>Add references</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {refs.map(r => {
                  const on = !excluded.has(r.id)
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRef(r.id)}
                      title={on ? 'Click to exclude' : 'Click to include'}
                      style={{
                        padding: 0,
                        border: on ? '2px solid var(--primary)' : '2px solid transparent',
                        borderRadius: 8,
                        background: 'none',
                        cursor: 'pointer',
                        opacity: on ? 1 : 0.35,
                      }}
                    >
                      <img src={dataUrl(r.image_b64, r.mime_type)} alt={r.label || ''} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                    </button>
                  )
                })}
              </div>
            )}
            {tooManyRefs && (
              <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>
                Only the first {MAX_REFERENCES_PER_DRAFT} selected references are sent to the models.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!ask.trim() || sizes.length === 0 || draftMutation.isPending}
              onClick={() => draftMutation.mutate()}
            >
              <I.wand size={14} /> {draftMutation.isPending ? 'Drafting…' : draft ? 'Redraft prompt' : 'Draft prompt'}
            </button>
          </div>
          {draftMutation.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{errText(draftMutation.error)}</div>}

          {draft && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div>
                <label className="label">Drafted prompt — edit before rendering</label>
                <textarea
                  className="textarea"
                  rows={6}
                  value={draft.prompt}
                  onChange={e => setDraft({ ...draft, prompt: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>
              <BriefCheckPanel check={draft.brief_check} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-green"
                  disabled={!draft.prompt.trim() || queueMutation.isPending}
                  onClick={() => queueMutation.mutate()}
                >
                  <I.play size={13} /> {queueMutation.isPending ? 'Queuing…' : `Render ${sizes.length} size${sizes.length === 1 ? '' : 's'}`}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  ≈ ${(sizes.length * COST_PER_IMAGE).toFixed(2)}
                </span>
              </div>
              {queueMutation.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{errText(queueMutation.error)}</div>}
            </div>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="label" style={{ marginBottom: 0 }}>In progress / awaiting review</div>
          {active.map(j => <JobCard key={j.id} job={j} brand={brand} refs={refs} />)}
        </div>
      )}
    </>
  )
}

function BriefCheckPanel({ check }: { check: BriefCheck | null }) {
  if (!check) return null
  const ok = check.passes && check.issues.length === 0
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        fontSize: 12.5,
        background: ok ? 'var(--green-50)' : 'var(--amber-50)',
        border: `1px solid ${ok ? 'var(--green-100)' : 'var(--amber-100)'}`,
        color: 'var(--text-2)',
      }}
    >
      <div style={{ fontWeight: 600, color: ok ? 'var(--green)' : 'var(--amber)', marginBottom: 4 }}>
        {ok ? 'Brief check passed' : `Brief check: ${check.issues.length} issue${check.issues.length === 1 ? '' : 's'}`}
      </div>
      {check.issues.length > 0 && (
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          {check.issues.map((i, idx) => <li key={idx}>{i}</li>)}
        </ul>
      )}
      {check.notes && <div>{check.notes}</div>}
    </div>
  )
}

// ── Job + generation cards ──────────────────────────────────

function JobCard({ job, brand, refs }: { job: ImageGenJob; brand: BrandProject; refs: BrandReference[] }) {
  const queryClient = useQueryClient()
  const [showPrompt, setShowPrompt] = useState(false)
  const meta = JOB_STATUS[job.status]
  const gens = sortedGens(job)

  const retry = useMutation({
    mutationFn: () => retryJob(job),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-gen-jobs', brand.id] }),
  })
  const del = useMutation({
    mutationFn: () => pgDelete(`/image_gen_jobs?id=eq.${job.id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['image-gen-jobs', brand.id] }),
  })
  const canRetry = job.status === 'failed' || gens.some(g => g.render_status === 'failed')

  return (
    <div className="card">
      <div className="card-h" style={{ gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-h-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.prompt_raw}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {new Date(job.created_at).toLocaleString()}
            {job.change_note && <> · changes: “{job.change_note}”</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span className={`pill ${meta.pill}`}>{meta.label}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPrompt(v => !v)}>{showPrompt ? 'Hide prompt' : 'Prompt'}</button>
          {canRetry && (
            <button className="btn btn-outline btn-sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
              <I.refresh size={12} /> Retry
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--red)' }}
            title="Delete job"
            onClick={() => { if (window.confirm('Delete this job and its images?')) del.mutate() }}
          >
            <I.trash size={13} />
          </button>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {showPrompt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
              {job.prompt_drafted}
            </div>
            <BriefCheckPanel check={job.brief_check} />
          </div>
        )}
        {job.error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{job.error}</div>}
        {retry.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{errText(retry.error)}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {gens.map(g => <GenerationCard key={g.id} gen={g} job={job} brand={brand} refs={refs} />)}
        </div>
      </div>
    </div>
  )
}

function GenerationCard({ gen, job, brand, refs }: {
  gen: ImageGenGeneration
  job: ImageGenJob
  brand: BrandProject
  refs: BrandReference[]
}) {
  const queryClient = useQueryClient()
  const size = SIZES[gen.size] || SIZES.post
  const [changing, setChanging] = useState(false)
  const [note, setNote] = useState('')
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['image-gen-jobs', brand.id] })
    queryClient.invalidateQueries({ queryKey: ['image-gen-history', brand.id] })
  }

  const review = useMutation({
    mutationFn: (args: { status: ImageGenReviewStatus; notes?: string }) =>
      pgPatch(`/image_gen_generations?id=eq.${gen.id}`, {
        review_status: args.status,
        review_notes: args.notes ?? null,
        reviewed_at: new Date().toISOString(),
      }),
    onSettled: invalidate,
  })

  // "Request changes": record the note, redraft from the previous prompt + note, queue a new job for this size.
  const requestChanges = useMutation({
    mutationFn: async () => {
      const changeNote = note.trim()
      await pgPatch(`/image_gen_generations?id=eq.${gen.id}`, {
        review_status: 'changes',
        review_notes: changeNote,
        reviewed_at: new Date().toISOString(),
      })
      const jobRefs = refs.filter(r => job.reference_ids.includes(r.id))
      const d = await draftPrompt({
        brand,
        ask: job.prompt_raw,
        sizes: [gen.size],
        references: jobRefs,
        previousPrompt: job.prompt_drafted,
        changeNote,
      })
      await queueJob({
        brandId: brand.id,
        ask: job.prompt_raw,
        prompt: d.prompt,
        briefCheck: d.brief_check,
        sizes: [gen.size],
        referenceIds: jobRefs.map(r => r.id),
        parentJobId: job.id,
        changeNote,
      })
    },
    onSuccess: () => { setChanging(false); setNote('') },
    onSettled: invalidate,
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!gen.image_b64) throw new Error('No image to save')
      const exact = await cropToSize(gen.image_b64, gen.mime_type, gen.size)
      const rows = await pgPost<{ id: string }[]>('/images', {
        source: 'ai_generated',
        prompt: job.prompt_drafted,
        image_b64: exact.slice(exact.indexOf(',') + 1),
        mime_type: 'image/png',
        title: `${brand.name} · ${size.label}: ${job.prompt_raw}`.slice(0, 200),
        generated_by: gen.generated_by || 'gemini-2.5-flash-image',
        metadata: { tool: 'image-gen', brand: brand.name, size: gen.size, job_id: job.id, generation_id: gen.id },
      })
      await pgPatch(`/image_gen_generations?id=eq.${gen.id}`, { library_image_id: rows[0].id })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library-images'] }),
    onSettled: invalidate,
  })

  const download = async () => {
    if (!gen.image_b64) return
    const a = document.createElement('a')
    a.href = await cropToSize(gen.image_b64, gen.mime_type, gen.size)
    a.download = `${slugify(brand.name, 20)}-${gen.size}-${size.w}x${size.h}-${slugify(job.prompt_raw)}.png`
    a.click()
  }

  const [aw, ah] = size.aspect.split(':').map(Number)
  const rmeta = REVIEW_STATUS[gen.review_status]
  const busy = review.isPending || requestChanges.isPending

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ aspectRatio: `${size.w} / ${size.h}`, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {gen.render_status === 'done' && gen.image_b64 ? (
          <img src={dataUrl(gen.image_b64, gen.mime_type)} alt={size.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : gen.render_status === 'failed' ? (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>{gen.error || 'Render failed'}</div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            <I.refresh size={16} style={{ display: 'block', margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
            Rendering…
          </div>
        )}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
            {size.label} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>{size.w}×{size.h} · {aw}:{ah}</span>
          </div>
          {gen.render_status === 'done' && <span className={`pill ${rmeta.pill}`}>{rmeta.label}</span>}
        </div>

        {gen.render_status === 'done' && gen.image_b64 && (
          <>
            {gen.review_status === 'pending' && !changing && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-green btn-sm" disabled={busy} onClick={() => review.mutate({ status: 'approved' })}>
                  <I.check size={12} /> Approve
                </button>
                <button className="btn btn-amber btn-sm" disabled={busy} onClick={() => setChanging(true)}>Changes</button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  title="Mark as background-only (background removal isn't automated yet)"
                  onClick={() => review.mutate({ status: 'bg_only' })}
                >
                  BG only
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  title="Mark for splitting into separate elements (not automated yet)"
                  onClick={() => review.mutate({ status: 'split' })}
                >
                  Split
                </button>
              </div>
            )}

            {changing && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="What should change? e.g. brighter, logo bottom-right, no people"
                  style={{ width: '100%', fontSize: 12.5, minHeight: 56 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" disabled={!note.trim() || busy} onClick={() => requestChanges.mutate()}>
                    {requestChanges.isPending ? 'Redrafting…' : 'Redraft & render'}
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setChanging(false)}>Cancel</button>
                </div>
              </div>
            )}

            {gen.review_status !== 'pending' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" onClick={download}><I.download size={12} /> Download</button>
                {gen.review_status === 'approved' && (
                  gen.library_image_id ? (
                    <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <I.check size={12} /> In library
                    </span>
                  ) : (
                    <button className="btn btn-outline btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
                      {save.isPending ? 'Saving…' : 'Save to library'}
                    </button>
                  )
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  title="Undo review decision"
                  onClick={() => review.mutate({ status: 'pending' })}
                >
                  Undo
                </button>
              </div>
            )}
            {gen.review_notes && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Note: {gen.review_notes}</div>}
          </>
        )}

        {[review, requestChanges, save].map((m, i) =>
          m.isError ? <div key={i} style={{ fontSize: 12, color: 'var(--red)' }}>{errText(m.error)}</div> : null,
        )}
      </div>
    </div>
  )
}

// ── History tab ─────────────────────────────────────────────

function HistoryTab({ brand }: { brand: BrandProject }) {
  const { data: jobs = [], isLoading } = useBrandJobs(brand.id)
  const { data: refs = [] } = useBrandRefs(brand.id)
  if (isLoading) return <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
  if (jobs.length === 0) {
    return (
      <div className="card">
        <div className="card-body" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          No jobs yet for {brand.name}.
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Last {jobs.length} jobs, newest first.</div>
      {jobs.map(j => <JobCard key={j.id} job={j} brand={brand} refs={refs} />)}
    </div>
  )
}

// ── Brief tab ───────────────────────────────────────────────

function BriefTab({ brand }: { brand: BrandProject }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(brand.name)
  const [brief, setBrief] = useState(brand.brief)
  const dirty = name.trim() !== brand.name || brief !== brand.brief
  const save = useMutation({
    mutationFn: () => pgPatch(`/brand_projects?id=eq.${brand.id}`, { name: name.trim(), brief }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-projects'] }),
  })
  return (
    <div className="card">
      <div className="card-h"><span className="card-h-title">Brand brief</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Brand name</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="label">Brief — every drafted prompt is checked against this</label>
          <textarea
            className="textarea"
            rows={14}
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder={'Colours: teal #00A19A primary, white, charcoal\nTone: friendly, local, never corporate\nAlways: logo bottom-right, real people\nNever: competitor colours, stock-photo handshakes'}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={!dirty || !name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save brief'}
          </button>
          {save.isSuccess && !dirty && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          {save.isError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{errText(save.error)}</span>}
        </div>
      </div>
    </div>
  )
}

// ── References tab ──────────────────────────────────────────

function ReferencesTab({ brand }: { brand: BrandProject }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: refs = [], isLoading } = useBrandRefs(brand.id)
  const [skipped, setSkipped] = useState<string[]>([])

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const tooBig: string[] = []
      const rows = []
      for (const f of files) {
        if (!f.type.startsWith('image/')) { tooBig.push(`${f.name} (not an image)`); continue }
        if (f.size > MAX_REFERENCE_BYTES) { tooBig.push(`${f.name} (over 5 MB)`); continue }
        const { b64, mime } = await fileToBase64(f)
        rows.push({ brand_id: brand.id, label: f.name, image_b64: b64, mime_type: mime })
      }
      setSkipped(tooBig)
      if (rows.length) await pgPost('/brand_references', rows)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-refs', brand.id] })
      if (inputRef.current) inputRef.current.value = ''
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => pgDelete(`/brand_references?id=eq.${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['brand-refs', brand.id] }),
  })

  return (
    <div className="card">
      <div className="card-h">
        <span className="card-h-title">Reference images ({refs.length})</span>
        <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
          <I.fileUp size={13} /> {upload.isPending ? 'Uploading…' : 'Upload images'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) upload.mutate(fs) }}
          />
        </label>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          Past posts, brand photography, logo lockups, colour swatches. They're sent to Claude when drafting the
          prompt and to Gemini when rendering, so the output follows the brand's look. PNG / JPG, max 5 MB each.
        </div>
        {skipped.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--amber)' }}>Skipped: {skipped.join(', ')}</div>}
        {upload.isError && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{errText(upload.error)}</div>}
        {isLoading && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {refs.map(r => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <img src={dataUrl(r.image_b64, r.mime_type)} alt={r.label || ''} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px' }}>
                <span style={{ flex: 1, fontSize: 11.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label || ''}>
                  {r.label || 'Reference'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 4, color: 'var(--red)' }}
                  title="Remove"
                  onClick={() => { if (window.confirm('Remove this reference?')) del.mutate(r.id) }}
                >
                  <I.trash size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Spend tab ───────────────────────────────────────────────

interface SpendRow {
  render_status: string
  review_status: ImageGenReviewStatus
  created_at: string
}

function SpendTab({ brand }: { brand: BrandProject }) {
  const { data: rows = [], isLoading } = useQuery<SpendRow[]>({
    queryKey: ['image-gen-history', brand.id],
    queryFn: () =>
      pgGet<SpendRow[]>(
        `/image_gen_generations?select=render_status,review_status,created_at,image_gen_jobs!inner(brand_id)&image_gen_jobs.brand_id=eq.${brand.id}&order=created_at.desc`,
      ),
  })

  const byMonth = useMemo(() => {
    const m = new Map<string, { rendered: number; approved: number; failed: number }>()
    for (const r of rows) {
      const k = r.created_at.slice(0, 7)
      const e = m.get(k) || { rendered: 0, approved: 0, failed: 0 }
      if (r.render_status === 'done') e.rendered++
      if (r.render_status === 'failed') e.failed++
      if (r.review_status === 'approved') e.approved++
      m.set(k, e)
    }
    return [...m.entries()]
  }, [rows])

  const rendered = rows.filter(r => r.render_status === 'done').length
  const approved = rows.filter(r => r.review_status === 'approved').length

  return (
    <div className="card">
      <div className="card-h"><span className="card-h-title">Spend — {brand.name}</span></div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isLoading ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Stat label="Images rendered" value={String(rendered)} />
              <Stat label="Approved" value={rendered ? `${approved} (${Math.round((approved / rendered) * 100)}%)` : '0'} />
              <Stat label="Est. render cost" value={`$${(rendered * COST_PER_IMAGE).toFixed(2)}`} />
            </div>
            {byMonth.length > 0 && (
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                    {['Month', 'Rendered', 'Approved', 'Failed', 'Est. cost'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map(([month, e]) => (
                    <tr key={month}>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{month}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{e.rendered}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{e.approved}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>{e.failed}</td>
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>${(e.rendered * COST_PER_IMAGE).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              Estimate only: ${COST_PER_IMAGE} per rendered image (Gemini 2.5 Flash Image list price). Prompt drafting with
              Claude Haiku adds well under a cent per draft. Check Google AI Studio billing for the real figure.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  )
}
