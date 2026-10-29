import { I } from './Icon'
import type { JobStatus } from '../../lib/types'

export function AIBadge({ label = 'AI Generated' }: { label?: string }) {
  return (
    <span className="ai-badge">
      <I.sparkle size={11} /> {label}
    </span>
  )
}

type PillColor = 'amber' | 'blue' | 'indigo' | 'purple' | 'green' | 'red' | 'teal' | 'slate'

const STATUS_META: Record<JobStatus, { color: PillColor; label: string }> = {
  brainstorm: { color: 'amber', label: 'Awaiting brainstorm review' },
  research:   { color: 'amber', label: 'Researching' },
  outline:    { color: 'amber', label: 'Awaiting outline review' },
  drafting:   { color: 'indigo', label: 'Drafting' },
  image:      { color: 'purple', label: 'Image step' },
  cms:        { color: 'blue', label: 'Ready to publish' },
  published:  { color: 'blue', label: 'Published' },
  scheduled:  { color: 'teal', label: 'Scheduled' },
  archived:   { color: 'slate', label: 'Archived' },
  failed:     { color: 'red', label: 'Failed' },
}

export function StatusPill({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status] ?? { color: 'slate' as const, label: status }
  const cls = meta.color === 'indigo' ? 'pill-blue' : `pill-${meta.color}`
  return (
    <span className={`pill ${cls}`}>
      <span className="pill-dot" />
      {meta.label}
    </span>
  )
}
