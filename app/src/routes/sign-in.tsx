import {createFileRoute, redirect} from '@tanstack/react-router'
import {meQuery, signInFn} from '../lib/session'
import {returnPath} from '../lib/return-path'
import {SignInCard} from '../ui/SignInCard'

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
  return (
    <main className="sign-in">
      <SignInCard send={signInFn} onIn={() => location.assign(redirect)} />
    </main>
  )
}
