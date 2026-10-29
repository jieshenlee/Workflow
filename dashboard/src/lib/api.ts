// Tiny PostgREST + n8n client. The browser runs on the host, so it hits
// the published container ports directly. No Vite proxy, no host-swap dance.

const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL || 'http://localhost:3001'
const N8N_BASE_URL  = import.meta.env.VITE_N8N_BASE_URL  || 'http://localhost:5678'

export const N8N_START_BLOG_URL = `${N8N_BASE_URL}/webhook/start-blog`
export const N8N_UPLOAD_BLOG_URL = `${N8N_BASE_URL}/webhook/upload-blog`
export const N8N_REPURPOSE_SOCIAL_URL = `${N8N_BASE_URL}/webhook/repurpose-social`
export const N8N_PUBLISH_CMS_URL = `${N8N_BASE_URL}/webhook/publish-cms`
export const N8N_GENERATE_META_URL = `${N8N_BASE_URL}/webhook/generate-meta`
export const N8N_SHORTEN_URL = `${N8N_BASE_URL}/webhook/shorten`
export const N8N_IMAGE_MAKER_URL = `${N8N_BASE_URL}/webhook/image-maker`
export const N8N_IMAGE_CHECK_URL = `${N8N_BASE_URL}/webhook/image-check`
export const N8N_GUIDELINE_UPLOAD_URL = `${N8N_BASE_URL}/webhook/guideline-upload`
export const N8N_GUIDELINE_CONFIRM_URL = `${N8N_BASE_URL}/webhook/guideline-confirm`
export const N8N_VIDEO_TEMPLATE_URL = `${N8N_BASE_URL}/webhook/video-template-extract`

export async function shortenUrl(longUrl: string): Promise<string> {
  const res = await fetch(`${N8N_SHORTEN_URL}?url=${encodeURIComponent(longUrl)}`)
  if (!res.ok) throw new Error(`Shorten webhook ${res.status}`)
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

export function n8nPost(url: string, body: unknown): Promise<unknown> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => jsonOrThrow(r, `n8n POST ${url}`))
}
