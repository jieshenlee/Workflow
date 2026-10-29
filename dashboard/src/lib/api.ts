// Tiny PostgREST + API client. The browser runs on the host, so it hits
// the published container ports directly. No Vite proxy, no host-swap dance.
//
// PostgREST = plain reads/writes of tables. API (backend/, FastAPI) = anything
// that calls an AI model or external service, plus the approval gates.

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3001'
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const API_START_BLOG_URL = `${API_URL}/api/start-blog`
export const API_UPLOAD_BLOG_URL = `${API_URL}/api/upload-blog`
export const API_REPURPOSE_SOCIAL_URL = `${API_URL}/api/repurpose-social`
export const API_PUBLISH_CMS_URL = `${API_URL}/api/publish-cms`
export const API_GENERATE_META_URL = `${API_URL}/api/generate-meta`
export const API_SHORTEN_URL = `${API_URL}/api/shorten`
export const API_IMAGE_MAKER_URL = `${API_URL}/api/image-maker`
export const API_IMAGE_CHECK_URL = `${API_URL}/api/image-check`
export const API_INSPIRATION_UPLOAD_URL = `${API_URL}/api/inspiration-upload`
export const API_GUIDELINE_UPLOAD_URL = `${API_URL}/api/guideline-upload`
export const API_GUIDELINE_CONFIRM_URL = `${API_URL}/api/guideline-confirm`
export const API_VIDEO_TEMPLATE_URL = `${API_URL}/api/video-template-extract`
export const API_IMAGE_GEN_DRAFT_URL = `${API_URL}/api/image-gen/draft`
export const API_IMAGE_GEN_RENDER_URL = `${API_URL}/api/image-gen/render`
export const apiJobRetryUrl = (jobId: string) => `${API_URL}/api/jobs/${jobId}/retry`

export async function shortenUrl(longUrl: string): Promise<string> {
  const res = await fetch(`${API_SHORTEN_URL}?url=${encodeURIComponent(longUrl)}`)
  if (!res.ok) throw new Error(`Shorten ${res.status}`)
  const data = await res.json() as { ok?: boolean; shortlink?: string; error?: string }
  if (!data.ok || !data.shortlink) throw new Error(data.error || 'TinyURL failed')
  return data.shortlink
}

async function jsonOrThrow(res: Response, ctx: string) {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${ctx} ${res.status}: ${body || res.statusText}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function pgGet<T>(path: string): Promise<T> {
  return fetch(`${POSTGREST_URL}${path}`, {
    headers: { Accept: 'application/json' },
  }).then(r => jsonOrThrow(r, `GET ${path}`))
}

export function pgPatch<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${POSTGREST_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  }).then(r => jsonOrThrow(r, `PATCH ${path}`))
}

export function pgPost<T>(path: string, body: unknown): Promise<T> {
  return fetch(`${POSTGREST_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  }).then(r => jsonOrThrow(r, `POST ${path}`))
}

export function pgDelete(path: string): Promise<null> {
  return fetch(`${POSTGREST_URL}${path}`, {
    method: 'DELETE',
  }).then(r => jsonOrThrow(r, `DELETE ${path}`))
}

export function apiPost(url: string, body: unknown): Promise<unknown> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => jsonOrThrow(r, `API POST ${url.replace(API_URL, '')}`))
}
