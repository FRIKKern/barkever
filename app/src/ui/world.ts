import {useMemo} from 'react'
import {useSuspenseQuery} from '@tanstack/react-query'
import {libraryQuery, prefsQuery} from '../lib/library'
import {indexLinks, type Links} from '../lib/links'
import {shelve, type Shelf} from '../lib/notebooks'
import type {Library, Prefs} from '../lib/model'

export type World = {lib: Library; prefs: Prefs; shelf: Shelf; links: Links}

export function useWorld(): World {
  const {data: lib} = useSuspenseQuery(libraryQuery)
  const {data: prefs} = useSuspenseQuery(prefsQuery)
  const shelf = useMemo(() => shelve(lib.notebooks), [lib.notebooks])
  const links = useMemo(() => indexLinks(lib), [lib])
  return {lib, prefs, shelf, links}
}
