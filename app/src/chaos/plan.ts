export type Kind = 'type' | 'revert' | 'add' | 'delete' | 'organize' | 'keep' | 'render' | 'net' | 'reload' | 'frame' | 'job' | 'reply' | 'drop' | 'wait' | 'raw'
export type Step = {w: number; k: Kind; a: number; b: number}
export type Setup = {writers: number; raw: boolean; blocks: number; solo: boolean}
export type Plan = {seed: number; setup: Setup; steps: Step[]}

export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WRITER: [Kind, number][] = [
  ['type', 26],
  ['revert', 4],
  ['add', 4],
  ['delete', 3],
  ['organize', 4],
  ['keep', 3],
  ['render', 8],
  ['net', 5],
  ['reload', 3],
  ['frame', 18],
  ['job', 15],
  ['reply', 15],
  ['drop', 5],
  ['wait', 2],
]
const QUIET = new Set<Kind>(['type', 'revert', 'add', 'delete', 'organize', 'keep'])

function weighted(table: [Kind, number][], x: number): Kind {
  let left = x * table.reduce((s, [, n]) => s + n, 0)
  for (const [k, n] of table) if ((left -= n) < 0) return k
  return table[table.length - 1][0]
}

export function plan(seed: number, solo = false): Plan {
  const r = rng(seed)
  const setup: Setup = {writers: 2 + Math.floor(r() * 2), raw: !solo && r() < 0.5, blocks: 1 + Math.floor(r() * 3), solo}
  const n = 15 + Math.floor(r() * 60)
  const steps: Step[] = []
  for (let i = 0; i < n; i++) {
    const pickRaw = setup.raw && r() < 1 / (2 * setup.writers + 1)
    const w = pickRaw ? setup.writers : Math.floor(r() * setup.writers)
    const table = solo && w > 0 ? WRITER.filter(([k]) => !QUIET.has(k)) : WRITER
    steps.push({w, k: pickRaw ? 'raw' : weighted(table, r()), a: r(), b: r()})
  }
  return {seed, setup, steps}
}
