export const metrics: Record<string, number | number[]> = {}

export const push = (k: string, v: number) => void ((metrics[k] as number[] | undefined)?.push(v) ?? (metrics[k] = [v]))

export function afterPaint(go: () => void) {
  requestAnimationFrame(() => {
    const ch = new MessageChannel()
    ch.port1.onmessage = go
    ch.port2.postMessage(0)
  })
}

export function settle(key: string, t0: number) {
  push(key, performance.now() - t0)
  afterPaint(() => push(key + 'Paint', performance.now() - t0))
}

export const wait: {open?: {id: string; t0: number}; search?: {q: string; t0: number}; ks?: {value: string; t0: number}} = {}
