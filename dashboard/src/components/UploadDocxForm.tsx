import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import mammoth from 'mammoth'
import { API_UPLOAD_BLOG_URL, apiPost } from '../lib/api'
import { I } from './ui/Icon'

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, t) => `# ${t}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, t) => `## ${t}\n\n`)
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, t) => `### ${t}\n\n`)
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, t) => `#### ${t}\n\n`)
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, (_, t) => `**${t}**`)
    .replace(/<b[^>]*>(.*?)<\/b>/gi, (_, t) => `**${t}**`)
    .replace(/<em[^>]*>(.*?)<\/em>/gi, (_, t) => `_${t}_`)
    .replace(/<i[^>]*>(.*?)<\/i>/gi, (_, t) => `_${t}_`)
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, t) => `- ${t}\n`)
    .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, t) => `${t}\n\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function docxToMarkdown(file: File): Promise<string> {
  const ab = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: ab })
  return htmlToMarkdown(html)
}

function filenameToTopic(name: string): string {
  return name.replace(/\.docx$/i, '').replace(/[-_]+/g, ' ').trim()
}

function extractTopic(md: string, filename: string): string {
  const h1 = md.match(/^#\s+(.+)$/m)
  return h1 ? h1[1].trim() : filenameToTopic(filename)
}

type Step = 'idle' | 'parsing' | 'preview' | 'submitting' | 'done' | 'error'

export default function UploadDocxForm() {
  const [step, setStep] = useState<Step>('idle')
  const [topic, setTopic] = useState('')
  const [draftMd, setDraftMd] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => apiPost(API_UPLOAD_BLOG_URL, { topic: topic.trim(), draft_md: draftMd }),
    onSuccess: () => {
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (e) => {
      setErrMsg(String(e))
      setStep('error')
    },
  })

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrMsg('Only .docx files are supported.')
      setStep('error')
      return
    }
    setStep('parsing')
    setErrMsg('')
    try {
      const md = await docxToMarkdown(file)
      setTopic(extractTopic(md, file.name))
      setDraftMd(md)
      setStep('preview')
    } catch (e) {
      setErrMsg(`Failed to parse file: ${String(e)}`)
      setStep('error')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const reset = () => {
    setStep('idle')
    setTopic('')
    setDraftMd('')
    setErrMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = () => {
    if (!topic.trim() || !draftMd || step === 'submitting') return
    setStep('submitting')
    mutation.mutate()
  }

  const wordCount = draftMd ? draftMd.split(/\s+/).filter(Boolean).length : 0

  return (
    <section className="card">
      <div className="card-h">
        <div>
          <div className="card-h-title">Upload a blog</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Import a .docx — skips brainstorm &amp; outline, goes straight to image generation.
          </div>
        </div>
      </div>

      <div className="card-body">
        {(step === 'idle' || step === 'error') && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '28px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                color: dragOver ? 'var(--accent)' : 'var(--text-3)',
                fontSize: 13,
                transition: 'border-color 0.15s, color 0.15s',
                userSelect: 'none',
              }}
            >
              <I.fileUp size={22} />
              <div style={{ marginTop: 8 }}>
                Drop a <strong>.docx</strong> file here, or click to browse
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".docx"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {step === 'error' && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red)' }}>{errMsg}</p>
            )}
          </>
        )}

        {step === 'parsing' && (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Parsing document…</p>
        )}

        {step === 'preview' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>
                Topic / Title
              </label>
              <input
                type="text"
                className="input"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 6,
                padding: '10px 14px',
                fontSize: 11.5,
                color: 'var(--text-3)',
                maxHeight: 150,
                overflowY: 'auto',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: 4,
              }}
            >
              {draftMd.slice(0, 900)}{draftMd.length > 900 ? '\n…' : ''}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 14 }}>
              {wordCount.toLocaleString()} words extracted
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={submit}
                disabled={!topic.trim()}
              >
                <I.fileUp size={14} sw={2.2} /> Upload Blog
              </button>
              <button className="btn btn-ghost" onClick={reset}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'submitting' && (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Uploading…</p>
        )}

        {step === 'done' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--green)' }}>
              Uploaded. The job will appear below — approve the generated image once it's ready.
            </p>
            <button className="btn btn-ghost btn-sm" onClick={reset} style={{ marginTop: 8 }}>
              Upload another
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
