import {queryOptions, type QueryClient} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {pushRecent, readPrefs, toggleShortcut} from '../server/prefs'
import {db, type LocalNote} from '../replica/db'
import {onChange} from '../replica/bus'
import {replayJournal} from '../replica/local'
import {toNote, toNotebook} from './note-docs'
import type {Library, Note, Prefs} from './model'

const fetchPrefs = createServerFn({method: 'GET'}).handler(() => readPrefs())

const pushRecentFn = createServerFn({method: 'POST'})
  .validator((id: string) => id)
  .handler(({data}) => pushRecent(data))
const toggleShortcutFn = createServerFn({method: 'POST'})
  .validator((id: string) => id)
  .handler(({data}) => toggleShortcut(data))

const local = {staleTime: Infinity, networkMode: 'always'} as const
const otherTab = new Map<string, number>()
const asNote = (d: LocalNote): Note => ({...toNote(d), gen: (d._gen ?? 0) + (otherTab.get(d._id) ?? 0)})

async function readLibrary(): Promise<Library> {
  await replayJournal()
  const d = await db()
  const [notes, notebooks] = await Promise.all([d.getAll('notes'), d.getAll('notebooks')])
  return {notes: notes.map(asNote), notebooks: notebooks.map(toNotebook)}
}

export const libraryQuery = queryOptions({...local, queryKey: ['library'], queryFn: readLibrary})
export const pendingQuery = queryOptions({...local, queryKey: ['pending'], queryFn: async () => new Set(await (await db()).getAllKeys('outbox'))})
export const stuckQuery = queryOptions({...local, queryKey: ['stuck'], queryFn: async () => (await (await db()).getAll('outbox')).flatMap((e) => (e.failed ? [{id: e.id, why: e.failed.why}] : []))})

async function loadPrefs(): Promise<Prefs> {
  const d = await db()
  try {
    const prefs = await fetchPrefs()
    await d.put('meta', prefs, 'prefs')
    return prefs
  } catch {
    return ((await d.get('meta', 'prefs')) as Prefs | undefined) ?? {shortcuts: [], recents: []}
  }
}

export const prefsQuery = queryOptions({queryKey: ['prefs'], staleTime: 30_000, networkMode: 'always', queryFn: loadPrefs})

export async function refresh(qc: QueryClient, ids: string[]) {
  const d = await db()
  const [docs, notebooks] = await Promise.all([Promise.all(ids.map((id) => d.get('notes', id))), d.getAll('notebooks')])
  const fresh = docs.filter((x): x is LocalNote => !!x).map(asNote)
  qc.setQueryData<Library>(libraryQuery.queryKey, (lib) => lib && {notes: [...fresh, ...lib.notes.filter((n) => !ids.includes(n.id))], notebooks: notebooks.map(toNotebook)})
  void qc.invalidateQueries({queryKey: pendingQuery.queryKey})
  void qc.invalidateQueries({queryKey: stuckQuery.queryKey})
}

export const followReplica = (qc: QueryClient) =>
  onChange(({kind, ids, tab}) => {
    if (tab && kind === 'local') for (const id of ids) otherTab.set(id, (otherTab.get(id) ?? 0) + 1)
    void refresh(qc, ids)
  })

const keepLocal = () => undefined
const setPrefs = (qc: QueryClient, patch: Partial<Prefs>) => qc.setQueryData<Prefs>(prefsQuery.queryKey, (p) => p && {...p, ...patch})

export function rememberRecent(qc: QueryClient, id: string) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p?.recents[0] === id) return
  if (p) setPrefs(qc, {recents: [id, ...p.recents.filter((x) => x !== id)]})
  pushRecentFn({data: id}).then((recents) => setPrefs(qc, {recents}), keepLocal)
}

export function flipShortcut(qc: QueryClient, id: string) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p) setPrefs(qc, {shortcuts: p.shortcuts.includes(id) ? p.shortcuts.filter((x) => x !== id) : [...p.shortcuts, id]})
  toggleShortcutFn({data: id}).then((shortcuts) => setPrefs(qc, {shortcuts}), keepLocal)
}
