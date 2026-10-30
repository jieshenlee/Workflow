import { useState } from 'react'
import { I } from './Icon'
import { exportDocx, exportMarkdown, slugify } from '../../lib/export'

export function ExportButtons({ markdown, title }: { markdown: string; title: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const baseName = slugify(title)

  const handleDocx = async () => {
    setBusy(true)
    setError(null)
    try {
      await exportDocx(markdown, title, baseName)
    } catch {
      setError('DOCX export needs a one-time install — run `npm install` in dashboard/, or use .md for now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn btn-outline btn-sm" onClick={handleDocx} disabled={busy || !markdown}>
        <I.download size={14} /> {busy ? 'Building .docx…' : 'Export .docx'}
      </button>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => exportMarkdown(markdown, baseName)}
        disabled={!markdown}
      >
        <I.download size={14} /> Export .md
      </button>
      {error && <span style={{ fontSize: 11.5, color: 'var(--amber)' }}>{error}</span>}
    </div>
  )
}
