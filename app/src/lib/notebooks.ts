import {NOTEBOOK_COLOURS} from '../styles/tokens.ts'
import type {Notebook} from './model.ts'

export type Shelf = {
  byId: Map<string, Notebook>
  roots: Notebook[]
  children: (id: string) => Notebook[]
  scope: (id: string) => string[]
  colour: (id: string | null) => string
  path: (id: string | null) => string[]
}

export function shelve(notebooks: Notebook[]): Shelf {
  const byId = new Map(notebooks.map((nb) => [nb.id, nb]))
  const sorted = [...notebooks].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const index = new Map(sorted.map((nb, i) => [nb.id, i]))
  const children = (id: string) => sorted.filter((nb) => nb.parent === id)
  return {
    byId,
    roots: sorted.filter((nb) => !nb.parent || !byId.has(nb.parent)),
    children,
    scope: (id) => [id, ...children(id).map((c) => c.id)],
    colour: (id) => (id && index.has(id) ? `var(--nb-${(index.get(id)! % NOTEBOOK_COLOURS) + 1})` : 'var(--c-faint)'),
    path: (id) => {
      const nb = id ? byId.get(id) : undefined
      if (!nb) return []
      const parent = nb.parent ? byId.get(nb.parent) : undefined
      return parent ? [parent.name, nb.name] : [nb.name]
    },
  }
}
