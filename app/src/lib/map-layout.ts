import {clip, LABEL, pickLabels, textWidth, type LabelBox, type Rect} from './labels.ts'
import type {Links} from './links.ts'
import {UNTITLED, type Library} from './model.ts'

export const MAP = {dx: 156, dy: 64, padX: 24, padTop: 52, padBot: 34, gap: 56, r: 6, titlePx: 13}

export const ZOOMS = Array.from({length: 14}, (_, i) => 2 ** ((i - 10) / 3))

export type Area = Rect & {id: string; notebook: string | null; title: string; notes: string[]}
export type MapNode = {id: string; x: number; y: number; r: number; area: string; title: string}
export type NotesMap = {areas: Area[]; nodes: MapNode[]; at: Map<string, MapNode>; edges: [string, string][]; W: number; H: number}

const byId = (a: {id: string}, b: {id: string}) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function areaName(notebook: string | null, names: Map<string, {name: string; parent: string | null}>): string {
  const nb = notebook ? names.get(notebook) : undefined
  if (!nb) return notebook ? 'Notebook' : 'No notebook'
  const parent = nb.parent ? names.get(nb.parent) : undefined
  return parent ? `${parent.name} › ${nb.name}` : nb.name
}

function shelfPack(areas: Area[]): {W: number; H: number} {
  const target = Math.max(...areas.map((a) => a.w), Math.sqrt(areas.reduce((s, a) => s + (a.w + MAP.gap) * (a.h + MAP.gap), 0)) * 1.4)
  let x = 0
  let y = 0
  let rowH = 0
  let W = 0
  for (const a of [...areas].sort((p, q) => q.h - p.h || p.title.localeCompare(q.title) || byId(p, q))) {
    if (x > 0 && x + a.w > target) (y += rowH + MAP.gap), (x = 0), (rowH = 0)
    a.x = x
    a.y = y
    x += a.w + MAP.gap
    rowH = Math.max(rowH, a.h)
    W = Math.max(W, a.x + a.w)
  }
  return {W, H: y + rowH}
}

function placeNotes(a: Area, cols: number, links: Links, title: (id: string) => string): MapNode[] {
  const {dx, dy, padTop, r} = MAP
  const rows = Math.ceil(a.notes.length / cols)
  const last = a.notes.length - (rows - 1) * cols
  const x0 = a.x + (a.w - cols * dx) / 2 + dx / 2
  const slots = Array.from({length: a.notes.length}, (_, i) => {
    const row = Math.floor(i / cols)
    const shift = row === rows - 1 ? ((cols - last) * dx) / 2 : 0
    return {x: x0 + (i % cols) * dx + shift, y: a.y + padTop + row * dy}
  })
  const cx = a.x + a.w / 2
  const cy = a.y + padTop + ((rows - 1) * dy) / 2
  slots.sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy) || p.y - q.y || p.x - q.x)
  return a.notes.map((id, i) => ({id, ...slots[i], r: r + Math.min(links.degree(id), 6) * 0.8, area: a.id, title: title(id)}))
}

export function layoutNotesMap({notes, notebooks}: Library, links: Links): NotesMap {
  const names = new Map(notebooks.map((nb) => [nb.id, nb]))
  const groups = new Map<string | null, string[]>()
  for (const n of [...notes].sort(byId)) groups.get(n.notebook)?.push(n.id) ?? groups.set(n.notebook, [n.id])
  const rank = (p: string, q: string) => links.degree(q) - links.degree(p) || (p < q ? -1 : 1)
  const shapes = [...groups].map(([notebook, ids]) => {
    const cols = Math.min(ids.length, Math.ceil(Math.sqrt((ids.length * MAP.dy * 2.5) / MAP.dx)))
    const title = `${areaName(notebook, names)} ${ids.length}`
    const inner = Math.max(cols * MAP.dx, textWidth(title, MAP.titlePx) + 4 * MAP.r)
    const area: Area = {id: notebook ?? '', notebook, title, notes: ids.sort(rank), x: 0, y: 0, w: inner + 2 * MAP.padX, h: MAP.padTop + (Math.ceil(ids.length / cols) - 1) * MAP.dy + MAP.padBot}
    return {area, cols}
  })
  const areas = shapes.map((s) => s.area)
  const {W, H} = shelfPack(areas)
  const title = (id: string) => links.byId.get(id)?.title || UNTITLED
  const nodes = shapes.flatMap(({area, cols}) => placeNotes(area, cols, links, title))
  const at = new Map(nodes.map((n) => [n.id, n]))
  const edges = nodes.flatMap((n) => links.outs(n.id).filter((t) => at.has(t)).map((t): [string, string] => [n.id, t]))
  return {areas: areas.sort(byId), nodes: nodes.sort((p, q) => rank(p.id, q.id)), at, edges, W, H}
}

function areaLabel(a: Area, k: number): LabelBox | null {
  const room = a.w * k - 4 * MAP.r
  const chars = Math.floor(room / (MAP.titlePx * 0.56)) - 2
  if (chars < 4 || a.h * k < LABEL.h + 2 * MAP.r) return null
  const text = clip(a.title, chars)
  return {id: `area:${a.id}`, area: true, text, x: a.x * k + 2 * MAP.r, y: a.y * k + MAP.r, w: textWidth(text, MAP.titlePx) + 2 * MAP.r, h: LABEL.h + 2}
}

const THIN_BELOW = 10
const THIN_CHARS = 16

export function mapLabels(map: NotesMap, k: number, first: string[] = []): LabelBox[] {
  const lead = first.map((id) => map.at.get(id)).filter((n) => !!n)
  const ranked = [...lead, ...map.nodes.filter((n) => !first.includes(n.id))]
  const fits = Math.min(LABEL.chars, Math.floor((MAP.dx * k - 2 * MAP.r) / (LABEL.px * 0.56)))
  const chars = fits >= THIN_BELOW ? fits : THIN_CHARS
  const nodeBox = (n: MapNode, i: number): LabelBox => {
    const text = clip(n.title, i < lead.length ? LABEL.chars : chars)
    const w = textWidth(text)
    return {id: n.id, text, x: n.x * k - w / 2, y: (n.y + n.r) * k + LABEL.gap, w, h: LABEL.h}
  }
  return pickLabels([...map.areas.map((a) => areaLabel(a, k)).filter((b) => !!b), ...ranked.map(nodeBox)])
}
