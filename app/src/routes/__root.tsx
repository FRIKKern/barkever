import {useEffect, type ReactNode} from 'react'
import {useQuery, useQueryClient, type QueryClient} from '@tanstack/react-query'
import {HeadContent, Outlet, Scripts, createRootRouteWithContext, redirect} from '@tanstack/react-router'
import {datasetQuery, followReplica} from '../lib/library'
import {nameReplica, replicaName} from '../replica/db'
import {startSync} from '../sync/engine'
import appCss from '../styles/app.css?url'
import {themeBoot, tokenCss} from '../styles/tokens'
import {meQuery} from '../lib/session'

export const Route = createRootRouteWithContext<{queryClient: QueryClient}>()({
  beforeLoad: async ({context, location}) => {
    if (location.pathname === '/sign-in') return
    if (!(await context.queryClient.ensureQueryData(meQuery))) throw redirect({to: '/sign-in', search: {redirect: location.href}})
  },
  head: () => ({
    meta: [{charSet: 'utf-8'}, {name: 'viewport', content: 'width=device-width, initial-scale=1'}, {title: 'Barkever'}],
    links: [{rel: 'icon', href: 'data:,'}, {rel: 'stylesheet', href: appCss}],
    styles: [{children: tokenCss}],
    scripts: [{children: themeBoot}],
  }),
  shellComponent: RootDocument,
  component: App,
})

function App() {
  const queryClient = useQueryClient()
  const me = useQuery(meQuery).data
  const ds = useQuery({...datasetQuery, enabled: !!me}).data
  useEffect(() => {
    if (me && ds) void replicaName(me.email, ds).then(nameReplica)
  }, [me, ds])
  useEffect(() => {
    const stop = followReplica(queryClient)
    startSync()
    return stop
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
