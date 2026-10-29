import {plain, type Note} from './data'

type Entry = {title: string; text: string; updatedAt: string}
const entries = new Map<string, Entry>()

export function put(x: Note) {
  entries.set(x._id, {title: x.title.toLowerCase(), text: (x.title + '\n' + plain(x.body)).toLowerCase(), updatedAt: x._updatedAt})
}

export function search(q: string, limit = 50): string[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const inTitle: [string, Entry][] = []
  const inBody: [string, Entry][] = []
  for (const hit of entries) {
    if (terms.every((t) => hit[1].text.includes(t))) (terms.every((t) => hit[1].title.includes(t)) ? inTitle : inBody).push(hit)
  }
  const recent = (a: [string, Entry], b: [string, Entry]) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1)
  return [...inTitle.sort(recent), ...inBody.sort(recent)].slice(0, limit).map(([id]) => id)
}
