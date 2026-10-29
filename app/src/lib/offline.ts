import type {QueryClient} from '@tanstack/react-query'
import {meQuery} from './session'

export function registerWorker() {
  const sw = navigator.serviceWorker
  if (!sw) return
  if (import.meta.env.PROD) sw.register('/sw.js', {type: 'module'}).catch((e) => console.warn('offline shell', e))
  else void sw.getRegistrations().then((all) => all.forEach((r) => r.unregister()))
}

export const keepPage = () => navigator.serviceWorker?.ready.then((r) => r.active?.postMessage('keep'))

export function recheckOnReconnect(qc: QueryClient, signedOut: () => void) {
  const check = () => void qc.fetchQuery({...meQuery, staleTime: 0}).then((me) => me || signedOut(), () => undefined)
  addEventListener('online', check)
  return () => removeEventListener('online', check)
}
