// Supabase Auth over plain fetch (email + password). The session is kept in
// localStorage and refreshed shortly before it expires. Every data request
// sends its access token, and row-level security in db/supabase-rls.sql
// only lets listed emails through.

import { useSyncExternalStore } from 'react'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** What's wrong with the Supabase settings in .env, or null if they look usable. */
export const supabaseConfigError: string | null = (() => {
  if (!supabaseConfigured) return null // handled as "not connected yet"
  let url: URL
  try {
    url = new URL(SUPABASE_URL)
  } catch {
    return `VITE_SUPABASE_URL isn't a valid URL. It should look like https://<project-ref>.supabase.co`
  }
  if (url.username || url.password || url.protocol.startsWith('postgres')) {
    return 'VITE_SUPABASE_URL contains a database connection string. That belongs in DATABASE_URL. ' +
      'Set VITE_SUPABASE_URL to just https://<project-ref>.supabase.co (no password).'
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    return 'VITE_SUPABASE_URL should start with https://'
  }
  if (/^(postgres|sb_secret_)/.test(SUPABASE_ANON_KEY)) {
    return 'VITE_SUPABASE_ANON_KEY must be the publishable key (sb_publishable_…), never a secret key or connection string.'
  }
  return null
})()

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  email: string
}

const STORAGE_KEY = 'pd-session'
const listeners = new Set<() => void>()
let session: Session | null = load()
let refreshing: Promise<Session> | null = null

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function set(next: Session | null) {
  session = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: session lives for this tab only
  }
  listeners.forEach(l => l())
}

async function tokenRequest(grant: 'password' | 'refresh_token', body: object): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Sign-in failed (${res.status})`)
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    email: data.user?.email ?? '',
  }
}

export async function signIn(email: string, password: string) {
  set(await tokenRequest('password', { email, password }))
}

export function signOut() {
  const token = session?.access_token
  set(null)
  if (token) {
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
}

/** A valid access token, refreshing first if it expires within a minute. Signs out if refresh fails. */
export async function accessToken(): Promise<string> {
  if (!session) throw new Error('Not signed in')
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token
  refreshing ??= tokenRequest('refresh_token', { refresh_token: session.refresh_token })
    .then(next => { set(next); return next })
    .catch(err => { set(null); throw err })
    .finally(() => { refreshing = null })
  return (await refreshing).access_token
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    () => session,
  )
}
