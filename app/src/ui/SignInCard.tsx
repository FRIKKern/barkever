import {useEffect, useState, type FormEvent} from 'react'
import {Icon} from './icons'

type Answer = {ok: true} | {ok: false; mfa: boolean; message: string}
type Send = (d: {data: {email: string; password: string; code?: string}}) => Promise<Answer>

export function SignInCard({send, onIn}: {send: Send; onIn: () => void}) {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mfa, setMfa] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => setReady(true), [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    const res = await send({data: {email: String(form.get('email')), password, code: mfa ? String(form.get('code')) : undefined}})
    if (res.ok) return onIn()
    setBusy(false)
    setError(res.message)
    setMfa(res.mfa)
    if (!res.mfa) setPassword('')
  }

  return (
    <form className="sign-card" method="post" onSubmit={submit}>
      <div className="brand">
        <Icon name="brand" />
        Barkever
      </div>
      <h1>Sign in</h1>
      <p className="muted">With your Barkpark account.</p>
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {mfa && (
        <label>
          Code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus />
        </label>
      )}
      {error && (
        <p className="sign-error" role="alert">
          {error}
        </p>
      )}
      <button className="sign-go" disabled={!ready || busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
