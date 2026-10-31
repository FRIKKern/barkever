import type {Links} from './links.ts'

export const GRAPH = {W: 340, H: 300, cx: 170, cy: 158, colX: 62, rimX: 14} as const

type GNode = {key: string; id: string | null; x: number; y: number; kind: 'center' | 'n' | 'd2' | 'tagged' | 'more'; r: number; label?: string}
type GEdge = {a: string; b: string; kind: '' | 'd2' | 'tagged'; both?: boolean}
type Graph = {nodes: GNode[]; edges: GEdge[]; empty: boolean}

export function layoutGraph(id: string, links: Links): Graph {
  const {W, H, cx, cy, colX, rimX} = GRAPH
  const nodes: GNode[] = [{key: id, id, x: cx, y: cy, kind: 'center', r: 10}]
  const edges: GEdge[] = []
  const ins = links.backs(id)
  const right = links.outs(id)
  const left = ins.filter((x) => !right.includes(x))
  const shown = new Set([id, ...left, ...right])
  const column = (list: string[], x: number, side: 'l' | 'r') => {
    const items = list.slice(0, list.length > 4 ? 3 : 4)
    const more = list.length - items.length
    const n = items.length + (more ? 1 : 0)
    const gap = Math.min(70, (H - 90) / Math.max(n - 1, 1))
    items.forEach((nid, i) => {
      const y = cy + (i - (n - 1) / 2) * gap
      nodes.push({key: nid, id: nid, x, y, kind: 'n', r: 6 + Math.min(links.degree(nid), 4) * 0.8})
      edges.push(side === 'l' ? {a: nid, b: id, kind: ''} : {a: id, b: nid, kind: '', both: ins.includes(nid)})
      const beyond = (side === 'l' ? links.backs(nid) : links.outs(nid)).filter((d) => !shown.has(d)).slice(0, 3)
      beyond.forEach((d, j) => {
        shown.add(d)
        nodes.push({key: d, id: d, x: side === 'l' ? rimX : W - rimX, y: y + (j - (beyond.length - 1) / 2) * 11, kind: 'd2', r: 3.2})
        edges.push(side === 'l' ? {a: d, b: nid, kind: 'd2'} : {a: nid, b: d, kind: 'd2'})
      })
    })
    if (more) nodes.push({key: `more-${side}`, id: null, x, y: cy + ((n - 1) / 2) * gap, kind: 'more', r: 5, label: `+${more} more`})
  }
  column(left, colX, 'l')
  column(right, W - colX, 'r')
  links
    .sharesTag(id, 4)
    .filter((r) => !shown.has(r))
    .slice(0, 2)
    .forEach((rid, i) => {
      nodes.push({key: rid, id: rid, x: cx, y: i === 0 ? cy - 86 : cy + 82, kind: 'tagged', r: 5})
      edges.push({a: id, b: rid, kind: 'tagged'})
    })
  return {nodes, edges, empty: !left.length && !right.length}
}

const f = (v: number) => v.toFixed(1)

export function edgePath(e: GEdge, a: GNode, b: GNode): string {
  if (e.kind === 'tagged') {
    const down = b.y > a.y ? 1 : -1
    return `M${f(a.x)} ${f(a.y + down * (a.r + 3))}L${f(b.x)} ${f(b.y - down * (b.r + 3))}`
  }
  const x1 = a.x + a.r + 2
  const x2 = b.x - b.r - 4
  const mx = (x1 + x2) / 2
  return `M${f(x1)} ${f(a.y)}C${f(mx)} ${f(a.y)} ${f(mx)} ${f(b.y)} ${f(x2)} ${f(b.y)}`
}

export function wrapLabel(t: string, max: number, lines = 2): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of t.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w
    else if (`${cur} ${w}`.length <= max) cur += ` ${w}`
    else (out.push(cur), (cur = w))
  }
  if (cur) out.push(cur)
  const res = out.slice(0, lines).map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l))
  if (out.length > lines) res[lines - 1] = `${res[lines - 1].slice(0, max - 1)}…`
  return res
}
