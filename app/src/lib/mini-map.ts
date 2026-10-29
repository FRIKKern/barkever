import type {Links} from './links.ts'
import type {Library} from './model.ts'

const M = {dx: 132, dy: 76, padX: 66, padTop: 62, padBot: 50, gapX: 46, gapY: 46}

export type Box = {id: string; x: number; y: number; w: number; h: number; rows: number; notes: string[]}
export type MiniMap = {boxes: Box[]; pos: Map<string, {x: number; y: number}>; W: number; H: number}

export function layoutMap({notes, notebooks}: Library, links: Links): MiniMap {
  const boxes = notebooks.map((nb) => {
    const ids = notes.filter((n) => n.notebook === nb.id).map((n) => n.id)
    const cols = Math.max(2, Math.ceil(Math.sqrt(ids.length * 0.8)))
    const rows = Math.max(1, Math.ceil(ids.length / cols))
    return {id: nb.id, notes: ids, cols, rows, x: 0, y: 0, w: (cols - 1) * M.dx + 2 * M.padX, h: (rows - 1) * M.dy + M.padTop + M.padBot}
  })
  const perRow = Math.ceil(boxes.length / 2) || 1
  const rows = [boxes.slice(0, perRow), boxes.slice(perRow)].filter((r) => r.length)
  const rowW = rows.map((r) => r.reduce((s, b) => s + b.w, 0) + M.gapX * (r.length - 1))
  const W = Math.max(0, ...rowW)
  let y = 0
  rows.forEach((r, i) => {
    let x = (W - rowW[i]) / 2
    const h = Math.max(...r.map((b) => b.h))
    for (const b of r) (b.x = x), (b.y = y + (i === 0 ? h - b.h : 0)), (x += b.w + M.gapX)
    y += h + M.gapY
  })
  const boxOf = new Map(boxes.flatMap((b) => b.notes.map((id) => [id, b] as const)))
  const centre = (b: Box) => ({x: b.x + b.w / 2, y: b.y + M.padTop + ((b.rows - 1) * M.dy) / 2})
  const pos = new Map<string, {x: number; y: number}>()
  for (const b of boxes) {
    const slots = Array.from({length: b.rows * b.cols}, (_, i) => ({x: b.x + M.padX + (i % b.cols) * M.dx, y: b.y + M.padTop + Math.floor(i / b.cols) * M.dy}))
    const c = centre(b)
    for (const id of [...b.notes].sort((p, q) => links.degree(q) - links.degree(p) || p.localeCompare(q))) {
      const cost = (s: {x: number; y: number}) =>
        0.35 * Math.hypot(s.x - c.x, s.y - c.y) +
        [...links.outs(id), ...links.backs(id)].reduce((sum, m) => {
          const other = boxOf.get(m)
          const p = pos.get(m) ?? (other && other !== b ? centre(other) : null)
          return p ? sum + Math.hypot(s.x - p.x, s.y - p.y) : sum
        }, 0)
      const best = slots.reduce((a, s) => (cost(s) < cost(a) ? s : a))
      pos.set(id, best)
      slots.splice(slots.indexOf(best), 1)
    }
  }
  return {boxes, pos, W, H: y - M.gapY}
}

export function curve(a: {x: number; y: number}, b: {x: number; y: number}, ra: number, rb: number): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const cx = (a.x + b.x) / 2 - dy * 0.16
  const cy = (a.y + b.y) / 2 + dx * 0.16
  const unit = (px: number, py: number) => {
    const l = Math.hypot(cx - px, cy - py) || 1
    return [(cx - px) / l, (cy - py) / l]
  }
  const [sx, sy] = unit(a.x, a.y)
  const [ex, ey] = unit(b.x, b.y)
  const f = (v: number) => v.toFixed(1)
  return `M${f(a.x + sx * ra)} ${f(a.y + sy * ra)}Q${f(cx)} ${f(cy)} ${f(b.x + ex * rb)} ${f(b.y + ey * rb)}`
}
