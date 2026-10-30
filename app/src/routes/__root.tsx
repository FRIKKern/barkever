import {useEffect, type ReactNode} from 'react'
import {useQuery, useQueryClient, type QueryClient} from '@tanstack/react-query'
import {HeadContent, Outlet, Scripts, createRootRouteWithContext, redirect, useRouter} from '@tanstack/react-router'
import {followReplica, sendStarsWhenOnline} from '../lib/library'
import {recheckOnReconnect, registerWorker} from '../lib/offline'
import {openReplica} from '../lib/owner'
import {startSync} from '../sync/engine'
import appCss from '../styles/app.css?url'
import {themeBoot, tokenCss} from '../styles/tokens'
import {meQuery} from '../lib/session'
import {needsSignIn} from '../lib/sign-in-gate'

export const Route = createRootRouteWithContext<{queryClient: QueryClient}>()({
  beforeLoad: async ({context, location}) => {
    if (!needsSignIn(location.pathname)) return
    if (!(await context.queryClient.ensureQueryData(meQuery))) throw redirect({to: '/sign-in', search: {redirect: location.href}})
  },
  head: () => ({
    meta: [{charSet: 'utf-8'}, {name: 'viewport', content: 'width=device-width, initial-scale=1'}, {name: 'barkever-build', content: import.meta.env.BUILD}, {title: 'Barkever'}],
    links: [{rel: 'icon', href: 'data:,'}, {rel: 'stylesheet', href: appCss}],
    styles: [{children: tokenCss}],
    scripts: [{children: themeBoot}],
  }),
  shellComponent: RootDocument,
  component: App,
})

function App() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const me = useQuery(meQuery).data
  useEffect(() => {
    if (me) void openReplica(me.email)
  }, [me])
  useEffect(() => {
    const stop = followReplica(queryClient)
    const unwatch = recheckOnReconnect(queryClient, () => void router.invalidate())
    const unstar = sendStarsWhenOnline(queryClient)
    registerWorker()
    startSync()
    return () => (stop(), unwatch(), unstar())
  }, [queryClient])
  return <Outlet />
}

function RootDocument({children}: {children: ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
