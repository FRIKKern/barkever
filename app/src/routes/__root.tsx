import type {ReactNode} from 'react'
import type {QueryClient} from '@tanstack/react-query'
import {HeadContent, Outlet, Scripts, createRootRouteWithContext} from '@tanstack/react-router'
import appCss from '../styles/app.css?url'
import {themeBoot, tokenCss} from '../styles/tokens'

export const Route = createRootRouteWithContext<{queryClient: QueryClient}>()({
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
