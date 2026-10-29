import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pgPost } from '../../lib/api'
import type { LibraryImage } from '../../lib/types'
import { I } from './Icon'

interface Props {
  /** Called with the freshly-inserted image after a successful upload. */
  onUploaded?: (image: LibraryImage) => void
  /** Compact = single-row button + filename (use in approval cards). Default = drop-zone style (use in library page). */
  variant?: 'compact' | 'block'
}

function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      // Data URL looks like "data:image/png;base64,XXXX" — strip the header.
      const comma = result.indexOf(',')
      const b64 = comma >= 0 ? result.slice(comma + 1) : result
      resolve({ b64, mime: file.type || 'image/png' })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function ImageUploader({ onUploaded, variant = 'block' }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const { b64, mime } = await fileToBase64(file)
      const rows = await pgPost<LibraryImage[]>('/images', {
        source: 'upload',
        image_b64: b64,
        mime_type: mime,
        title: title.trim() || file.name,
        generated_by: 'manual',
      })
      return rows[0]
    },
    onSuccess: image => {
      queryClient.invalidateQueries({ queryKey: ['library-images'] })
      queryClient.invalidateQueries({ queryKey: ['recent-library-images'] })
      setFile(null)
      setTitle('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      onUploaded?.(image)
    },
  })

  const onPick: React.ChangeEventHandler<HTMLInputElement> = e => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      alert('Please pick an image file.')
      return
    }
    if (f.size > 8 * 1024 * 1024) {
      alert('Images over 8MB are too large for base64 storage. Compress first.')
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const buttonLabel = mutation.isPending
    ? 'Uploading…'
    : file
    ? `Upload "${file.name}"`
    : 'Choose image'

  if (variant === 'compact') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          style={{ display: 'none' }}
          id="image-uploader-compact-input"
        />
        <label htmlFor="image-uploader-compact-input" className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
          <I.image size={13} /> {file ? file.name : 'Choose file'}
        </label>
        {file && (
          <>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 140, padding: '6px 10px', fontSize: 12.5 }}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title (optional)"
            />
            <button
              className="btn btn-green btn-sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Uploading…' : 'Upload & use'}
            </button>
          </>
        )}
        {mutation.isError && (
          <span style={{ fontSize: 12, color: 'var(--red)' }}>
            {String(mutation.error)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{
      border: '1.5px dashed var(--border)',
      borderRadius: 10,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      background: 'var(--bg-2)',
    }}>
      <I.image size={28} stroke="var(--text-3)" />
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        {file ? file.name : 'Upload an image to the library'}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        style={{ display: 'none' }}
        id="image-uploader-block-input"
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <label htmlFor="image-uploader-block-input" className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
          <I.image size={13} /> {file ? 'Pick a different file' : 'Choose file'}
        </label>
        {file && (
          <button
            className="btn btn-green btn-sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {buttonLabel}
          </button>
        )}
      </div>

      {file && (
        <input
          type="text"
          className="input"
          style={{ maxWidth: 360, fontSize: 13 }}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Optional title (defaults to filename)"
        />
      )}

      {mutation.isError && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)' }}>
          Upload failed: <span className="mono">{String(mutation.error)}</span>
        </p>
      )}
    </div>
  )
}
