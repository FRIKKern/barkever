import type {ReactNode} from 'react'
import type {QueryClient} from '@tanstack/react-query'
import {HeadContent, Outlet, Scripts, createRootRouteWithContext, redirect} from '@tanstack/react-router'
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
  component: Outlet,
})

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
