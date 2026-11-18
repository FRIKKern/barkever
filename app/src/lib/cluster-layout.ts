import {clip, LABEL, pickLabels, textWidth, type LabelBox} from './labels.ts'
import type {Links} from './links.ts'
import {UNTITLED, type Title} from './model.ts'

export const CLUSTER = {W: 340, H: 300, cx: 170, cy: 146, r1: 80, r2: 130, ring1: 8, perHub: 3, ring2: 20}

export type ClusterNode = {id: string; x: number; y: number; r: number; hop: 0 | 1 | 2}
export type Cluster = {nodes: ClusterNode[]; edges: {a: string; b: string}[]; more: number}

const CHARS = [24, 18, 14]

export function layoutCluster(id: string, links: Links): Cluster {
  const {cx, cy, r1, r2} = CLUSTER
  const near = (x: string) => [...new Set([...links.backs(x), ...links.outs(x)])]
  const side = (x: string) => (links.outs(id).includes(x) ? (links.backs(id).includes(x) ? 1 : 2) : 0)
  const busy = (p: string, q: string) => links.degree(q) - links.degree(p) || (p < q ? -1 : 1)
  const one = near(id).sort((p, q) => side(p) - side(q) || busy(p, q))
  const ring = one.slice(0, CLUSTER.ring1)
  const seen = new Set([id, ...one])
  const two = new Set(one.flatMap(near).filter((x) => !seen.has(x)))
  const nodes: ClusterNode[] = [{id, x: cx, y: cy, r: 9, hop: 0}]
  const shown = new Set([id])
  const slice = (2 * Math.PI) / Math.max(ring.length, 1)
  ring.forEach((p, i) => {
    const angle = Math.PI / 2 + (i + 0.5) * slice
    nodes.push({id: p, x: cx + r1 * Math.cos(angle), y: cy + r1 * Math.sin(angle), r: 6 + Math.min(links.degree(p), 4) * 0.6, hop: 1})
    shown.add(p)
    const outer = near(p).filter((x) => two.has(x) && !shown.has(x)).sort(busy).slice(0, CLUSTER.perHub)
    const step = Math.min(0.3, slice / Math.max(outer.length, 1))
    outer.forEach((q, j) => {
      if (nodes.length - i - 2 >= CLUSTER.ring2) return
      const a = angle + (j - (outer.length - 1) / 2) * step
      nodes.push({id: q, x: cx + r2 * Math.cos(a), y: cy + r2 * Math.sin(a), r: 3.5, hop: 2})
      shown.add(q)
    })
  })
  const edges = nodes.flatMap((n) => links.outs(n.id).filter((t) => shown.has(t)).map((t) => ({a: n.id, b: t})))
  return {nodes, edges, more: one.length + two.size + 1 - nodes.length}
}

export function clusterLabels(g: Cluster, title: Title): LabelBox[] {
  return pickLabels(
    g.nodes.map((n) => {
      const text = clip(title(n.id) ?? UNTITLED, CHARS[n.hop])
      const w = textWidth(text)
      const y = n.hop ? n.y + n.r + LABEL.gap : n.y - n.r - LABEL.gap - LABEL.h
      return {id: n.id, text, x: Math.min(Math.max(n.x - w / 2, 0), CLUSTER.W - w), y, w, h: LABEL.h}
    }),
  )
}
