import {queryOptions, type QueryClient} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {createNote, readLibrary, saveBody, setTitle, type BodySave} from '../server/notes'
import {pushRecent, readPrefs, toggleShortcut} from '../server/prefs'
import {canvasFiles} from '../server/canvas'
import type {Library, Note, Prefs} from './model'

const fetchLibrary = createServerFn({method: 'GET'}).handler(() => readLibrary())
const fetchPrefs = createServerFn({method: 'GET'}).handler(() => readPrefs())
export const fetchCanvasFiles = createServerFn({method: 'GET'}).handler(() => canvasFiles())

export const createNoteFn = createServerFn({method: 'POST'})
  .validator((d: {id: string; notebook: string; blockId: string}) => d)
  .handler(({data}) => createNote(data))
export const setTitleFn = createServerFn({method: 'POST'})
  .validator((d: {id: string; title: string}) => d)
  .handler(({data}) => setTitle(data))
export const saveBodyFn = createServerFn({method: 'POST'})
  .validator((d: BodySave) => d)
  .handler(({data}) => saveBody(data))
const pushRecentFn = createServerFn({method: 'POST'})
  .validator((id: string) => id)
  .handler(({data}) => pushRecent(data))
const toggleShortcutFn = createServerFn({method: 'POST'})
  .validator((id: string) => id)
  .handler(({data}) => toggleShortcut(data))

export const libraryQuery = queryOptions({queryKey: ['library'], staleTime: 30_000, queryFn: (): Promise<Library> => fetchLibrary()})
export const prefsQuery = queryOptions({queryKey: ['prefs'], staleTime: 30_000, queryFn: (): Promise<Prefs> => fetchPrefs()})

export function putNote(qc: QueryClient, id: string, patch: Partial<Note> | ((n: Note) => Partial<Note>)) {
  qc.setQueryData<Library>(libraryQuery.queryKey, (lib) =>
    lib && {...lib, notes: lib.notes.map((n) => (n.id === id ? {...n, ...(typeof patch === 'function' ? patch(n) : patch)} : n))},
  )
}

export function addNote(qc: QueryClient, note: Note) {
  qc.setQueryData<Library>(libraryQuery.queryKey, (lib) => lib && {...lib, notes: [note, ...lib.notes]})
}

const setPrefs = (qc: QueryClient, patch: Partial<Prefs>) => qc.setQueryData<Prefs>(prefsQuery.queryKey, (p) => p && {...p, ...patch})

export function rememberRecent(qc: QueryClient, id: string) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p?.recents[0] === id) return
  if (p) setPrefs(qc, {recents: [id, ...p.recents.filter((x) => x !== id)]})
  pushRecentFn({data: id}).then((recents) => setPrefs(qc, {recents}))
}

export function flipShortcut(qc: QueryClient, id: string) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p) setPrefs(qc, {shortcuts: p.shortcuts.includes(id) ? p.shortcuts.filter((x) => x !== id) : [...p.shortcuts, id]})
  toggleShortcutFn({data: id}).then((shortcuts) => setPrefs(qc, {shortcuts}))
}
