import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_START_BLOG_URL, apiPost } from '../lib/api'
import { I } from './ui/Icon'

export default function StartTopicForm() {
  const [topic, setTopic] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (t: string) => apiPost(API_START_BLOG_URL, { topic: t }),
    onSuccess: () => {
      setTopic('')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = topic.trim()
    if (!trimmed || mutation.isPending) return
    mutation.mutate(trimmed)
  }

  return (
    <section className="card">
      <div className="card-h">
        <div>
          <div className="card-h-title">Start a topic</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Claude brainstorms 4&ndash;6 angles, then pauses for your approval.
          </div>
        </div>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            className="input"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. How AI is changing content marketing for small businesses"
            disabled={mutation.isPending}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!topic.trim() || mutation.isPending}
          >
            {mutation.isPending ? (
              'Starting…'
            ) : (
              <>
                <I.plus size={14} sw={2.2} /> Start
              </>
            )}
          </button>
        </form>

        {mutation.isError && (
          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--red)' }}>
            Failed to start: <span className="mono">{String(mutation.error)}</span>
          </p>
        )}
        {mutation.isSuccess && (
          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--green)' }}>
            Launched. The new job will appear below in a few seconds.
          </p>
        )}
      </div>
    </section>
  )
}
