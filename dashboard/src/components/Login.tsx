import { useState } from 'react'
import { signIn, supabaseConfigError, supabaseConfigured } from '../lib/auth'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="sb-brand-mark">PD</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Project Digital</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) {
    return (
      <Shell>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          The dashboard isn't connected to Supabase yet. Add <span className="mono">VITE_SUPABASE_URL</span> and{' '}
          <span className="mono">VITE_SUPABASE_ANON_KEY</span> to the <span className="mono">.env</span> file in the
          project folder, then restart <span className="mono">npm run dev</span>.
        </div>
      </Shell>
    )
  }

  if (supabaseConfigError) {
    return (
      <Shell>
        <div style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.6 }}>{supabaseConfigError}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          Fix it in the <span className="mono">.env</span> file in the project folder, then restart{' '}
          <span className="mono">npm run dev</span>.
        </div>
      </Shell>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" autoComplete="email" required value={email}
                 onChange={e => setEmail(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <input id="login-password" className="input" type="password" autoComplete="current-password" required
                 value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
      </form>
    </Shell>
  )
}
