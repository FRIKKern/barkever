export const samples = { switch: [], search: [], key: [] }
export const pending = { switch: null, search: null, key: null }

export const afterFrame = (fn) =>
  requestAnimationFrame(() => {
    const ch = new MessageChannel()
    ch.port1.onmessage = fn
    ch.port2.postMessage(0)
  })

export const start = (kind, e, extra) => (pending[kind] = { t0: e.timeStamp, ...extra })

export function settle(kind, matches) {
  const p = pending[kind]
  if (!p || !matches(p)) return
  pending[kind] = null
  afterFrame(() => samples[kind].push(+(performance.now() - p.t0).toFixed(2)))
}
