export type Change = {kind: 'local' | 'remote'; ids: string[]; tab?: true}

const listeners = new Set<(c: Change) => void>()
let channel: BroadcastChannel | undefined

function open() {
  if (channel || typeof window === 'undefined') return channel
  channel = new BroadcastChannel('barkever')
  channel.onmessage = (e: MessageEvent<Change>) => listeners.forEach((l) => l({...e.data, tab: true}))
  return channel
}

export function notify(change: Change) {
  listeners.forEach((l) => l(change))
  open()?.postMessage(change)
}

export function onChange(listener: (c: Change) => void) {
  open()
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
