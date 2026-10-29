import {useMemo} from 'react'
import {useSuspenseQuery} from '@tanstack/react-query'
import {libraryQuery, prefsQuery} from '../lib/library'
import {indexLinks, type Links} from '../lib/links'
import {shelve, type Shelf} from '../lib/notebooks'
import type {Library, Note, Prefs} from '../lib/model'

export type World = {lib: Library; prefs: Prefs; shelf: Shelf; links: Links; perNotebook: Map<string, number>; tags: [string, number][]}

function tally(notes: Note[]) {
  const perNotebook = new Map<string, number>()
  const perTag = new Map<string, number>()
  for (const n of notes) {
    if (n.notebook) perNotebook.set(n.notebook, (perNotebook.get(n.notebook) ?? 0) + 1)
    for (const t of n.tags) perTag.set(t, (perTag.get(t) ?? 0) + 1)
  }
  return {perNotebook, tags: [...perTag].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))}
}

export function useWorld(): World {
  const {data: lib} = useSuspenseQuery(libraryQuery)
  const {data: prefs} = useSuspenseQuery(prefsQuery)
  const shelf = useMemo(() => shelve(lib.notebooks), [lib.notebooks])
  const links = useMemo(() => indexLinks(lib), [lib])
  const counts = useMemo(() => tally(lib.notes), [lib.notes])
  return {lib, prefs, shelf, links, ...counts}
}
