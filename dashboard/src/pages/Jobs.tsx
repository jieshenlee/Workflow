import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pgDelete, pgGet } from '../lib/api'
import type { ContentJob, JobStatus } from '../lib/types'
import { StatusPill } from '../components/ui/Badges'
import { I } from '../components/ui/Icon'
import { useJobNav } from '../components/ui/JobNav'

type FilterKey = 'all' | 'blog' | 'social' | 'pending' | 'published'

const PENDING_STATUSES = new Set<JobStatus>(['brainstorm', 'research', 'outline', 'drafting', 'image', 'cms'])
const DONE_STATUSES = new Set<JobStatus>(['published', 'scheduled'])

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Jobs({ branchOnly }: { branchOnly?: 'blog' | 'social' } = {}) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const { openJob } = useJobNav()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery<ContentJob[]>({
    queryKey: ['jobs'],
    queryFn: () => pgGet<ContentJob[]>('/content_jobs?order=updated_at.desc&limit=50'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pgDelete(`/content_jobs?id=eq.${id}`),
    onSuccess: () => {
      // Cascade removes approvals + images + captions in Postgres; refresh all
      // React caches that surface jobs or their derived rows.
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['processing-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['pending-brainstorms'] })
      queryClient.invalidateQueries({ queryKey: ['pending-outlines'] })
      queryClient.invalidateQueries({ queryKey: ['pending-drafts'] })
      queryClient.invalidateQueries({ queryKey: ['pending-images'] })
    },
  })

  const handleDelete = (e: React.MouseEvent, job: ContentJob) => {
    e.stopPropagation()
    const ok = window.confirm(
      `Delete "${job.topic}"?\n\nThis permanently removes the job and all its approvals, generated images, and captions. ` +
      `If an AI step is running for it right now, that step will fail quietly in the background.`,
    )
    if (ok) deleteMutation.mutate(job.id)
  }

  const allJobs = data ?? []
  const jobs = branchOnly ? allJobs.filter(j => j.branch === branchOnly) : allJobs
  const filtered = jobs.filter(j => {
    if (filter === 'all') return true
    if (filter === 'blog') return j.branch === 'blog'
    if (filter === 'social') return j.branch === 'social'
    if (filter === 'pending') return PENDING_STATUSES.has(j.status)
    if (filter === 'published') return DONE_STATUSES.has(j.status)
    return true
  })

  const pendingCount = jobs.filter(j => PENDING_STATUSES.has(j.status)).length
  const publishedToday = jobs.filter(j => {
    if (j.status !== 'published') return false
    const d = new Date(j.updated_at)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length
  const scheduledCount = jobs.filter(j => j.status === 'scheduled').length

  const stats = [
    { label: 'Total Jobs', val: jobs.length, icon: I.dashboard },
    { label: 'Awaiting Approval', val: pendingCount, icon: I.clock },
    { label: 'Published Today', val: publishedToday, icon: I.check },
    { label: 'Scheduled', val: scheduledCount, icon: I.calendar },
  ]

  return (
    <section>
      <div className="stats">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div className="stat" key={s.label}>
              <div className="stat-label">
                <Icon size={13} /> {s.label}
              </div>
              <div className="stat-val">{s.val}</div>
              <div className="stat-delta">auto-refreshes every 5s</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 14px' }}>
        <div className="tabs">
          {((branchOnly
            ? [
                ['all', 'All', jobs.length],
                ['pending', 'Pending', pendingCount],
                ['published', 'Published', jobs.filter(j => DONE_STATUSES.has(j.status)).length],
              ]
            : [
                ['all', 'All', jobs.length],
                ['blog', 'Blog', jobs.filter(j => j.branch === 'blog').length],
                ['social', 'Social', jobs.filter(j => j.branch === 'social').length],
                ['pending', 'Pending', pendingCount],
                ['published', 'Published', jobs.filter(j => DONE_STATUSES.has(j.status)).length],
              ]) as Array<[FilterKey, string, number]>
          ).map(([k, label, n]) => (
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
        <div className="card">
          <div className="card-body" style={{ color: 'var(--text-3)' }}>Loading jobs…</div>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--red-100)', background: 'var(--red-50)' }}>
          <div className="card-body" style={{ color: 'var(--red)' }}>
            <p style={{ margin: 0, fontWeight: 500 }}>Failed to load jobs.</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }} className="mono">{String(error)}</p>
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>
              Can't reach Supabase. Check <code className="mono">VITE_SUPABASE_URL</code> in .env, and that you ran <code className="mono">python -m scripts.setup_db</code>.
            </p>
          </div>
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--text-3)', textAlign: 'center', padding: 32 }}>
            No jobs match this filter.
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="jt">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Branch</th>
                <th>Current stage</th>
                <th>Chosen angle</th>
                <th>Updated</th>
                <th style={{ width: 40 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.id} className="job-row" onClick={() => openJob(j.id)}>
                  <td>
                    <div className="job-title">{j.topic}</div>
                    {j.shortlink && (
                      <div className="job-sub mono">{j.shortlink}</div>
                    )}
                  </td>
                  <td>
                    <span className={`pill pill-${j.branch === 'blog' ? 'slate' : 'purple'}`}>
                      {j.branch === 'blog' ? 'Blog' : 'Social'}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={j.status} />
                  </td>
                  <td style={{ maxWidth: 340 }}>
                    {j.chosen_angle ? (
                      <span style={{ color: 'var(--text-2)' }}>{j.chosen_angle}</span>
                    ) : (
                      <span className="muted">&mdash;</span>
                    )}
                  </td>
                  <td>
                    <span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(j.updated_at)}</span>
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={e => handleDelete(e, j)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === j.id}
                      title="Delete this job and all its data"
                      style={{ padding: 6, color: 'var(--text-3)' }}
                      aria-label={`Delete job: ${j.topic}`}
                    >
                      <I.trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
