import type {FormEvent} from 'react'
import {forgetDevice} from '../replica/local'
import {unsyncedNow} from '../lib/saver'
import {forgetOwner} from '../lib/owner'
import {Icon} from './icons'

const lossWarning = (pending: number | null) =>
  pending === null
    ? 'Can’t check whether every change has reached Barkpark. Sign out and risk losing them?'
    : `${pending} ${pending === 1 ? 'change has' : 'changes have'} not reached Barkpark yet. Sign out and lose ${pending === 1 ? 'it' : 'them'}?`

const FORGET_LIMIT_MS = 5000

async function signOut(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  const form = e.currentTarget
  const pending = await unsyncedNow()
  if (pending !== 0 && !confirm(lossWarning(pending))) return
  await Promise.race([Promise.allSettled([forgetDevice(), forgetOwner()]), new Promise((done) => setTimeout(done, FORGET_LIMIT_MS))])
  form.submit()
}

export function SignOut() {
  return (
    <form method="post" action="/sign-out" onSubmit={(e) => void signOut(e)}>
      <button className="icon-btn" title="Sign out" aria-label="Sign out" data-testid="sign-out">
        <Icon name="out" />
      </button>
    </form>
  )
}
