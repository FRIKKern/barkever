import {titleIn, wikilinks, type Library, type Note, type Title} from './model.ts'

export type Links = {
  byId: Map<string, Note>
  title: Title
  outs: (id: string) => string[]
  backs: (id: string) => string[]
  degree: (id: string) => number
  sharesTag: (id: string, max: number) => string[]
  total: number
}

export function indexLinks({notes}: Library): Links {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const out = new Map(notes.map((n) => [n.id, [...new Set([...n.links, ...wikilinks(n.blocks)])].filter((t) => t !== n.id && byId.has(t))]))
  const back = new Map<string, string[]>()
  for (const [from, tos] of out) for (const to of tos) back.set(to, [...(back.get(to) ?? []), from])
  const outs = (id: string) => out.get(id) ?? []
  const backs = (id: string) => back.get(id) ?? []
  const degree = (id: string) => new Set([...outs(id), ...backs(id)]).size
  function sharesTag(id: string, max: number) {
    const n = byId.get(id)
    if (!n?.tags.length) return []
    const skip = new Set([id, ...outs(id), ...backs(id)])
    const score = (m: Note) => m.tags.filter((t) => n.tags.includes(t)).length + (m.notebook === n.notebook ? 0.5 : 0) + degree(m.id) * 0.1
    return notes
      .filter((m) => !skip.has(m.id) && m.tags.some((t) => n.tags.includes(t)))
      .map((m) => ({id: m.id, s: score(m)}))
      .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
      .slice(0, max)
      .map((x) => x.id)
  }
  return {byId, title: titleIn(byId), outs, backs, degree, sharesTag, total: [...out.values()].reduce((s, l) => s + l.length, 0)}
}
