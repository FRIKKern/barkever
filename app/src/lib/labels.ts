export type Rect = {x: number; y: number; w: number; h: number}
export type LabelBox = Rect & {id: string; text: string; area?: boolean}

export const LABEL = {px: 11.5, h: 15, chars: 22, gap: 2}

export const clip = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t)

export const textWidth = (t: string, px = LABEL.px) => t.length * px * 0.56

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export function pickLabels(ranked: LabelBox[]): LabelBox[] {
  const cell = Math.max(64, ...ranked.slice(0, 200).map((b) => b.w))
  const grid = new Map<string, LabelBox[]>()
  const cells = (b: Rect) => {
    const out: string[] = []
    for (let i = Math.floor(b.x / cell); i <= Math.floor((b.x + b.w) / cell); i++) for (let j = Math.floor(b.y / cell); j <= Math.floor((b.y + b.h) / cell); j++) out.push(`${i} ${j}`)
    return out
  }
  const shown: LabelBox[] = []
  for (const b of ranked) {
    const keys = cells(b)
    if (keys.some((k) => grid.get(k)?.some((o) => overlaps(o, b)))) continue
    shown.push(b)
    for (const k of keys) grid.get(k)?.push(b) ?? grid.set(k, [b])
  }
  return shown
}
