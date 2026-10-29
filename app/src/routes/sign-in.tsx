import {useState, type FormEvent} from 'react'
import {createFileRoute, redirect} from '@tanstack/react-router'
import {meQuery, signInFn} from '../lib/session'
import {returnPath} from '../lib/return-path'
import {Icon} from '../ui/icons'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (s: Record<string, unknown>) => ({redirect: returnPath(s.redirect)}),
  beforeLoad: async ({context, search}) => {
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({href: search.redirect})
  },
  head: () => ({meta: [{title: 'Sign in · Barkever'}]}),
  component: SignIn,
})

function SignIn() {
  const {redirect} = Route.useSearch()
  const [busy, setBusy] = useState(false)
  const [mfa, setMfa] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    const res = await signInFn({data: {email: String(form.get('email')), password, code: mfa ? String(form.get('code')) : undefined}})
    if (res.ok) return location.assign(redirect)
    setBusy(false)
    setError(res.message)
    setMfa(res.mfa)
    if (!res.mfa) setPassword('')
  }

  return (
    <main className="sign-in">
      <form className="sign-card" onSubmit={submit}>
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
        <button className="sign-go" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
