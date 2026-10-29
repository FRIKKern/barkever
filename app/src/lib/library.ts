import {queryOptions, type QueryClient} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {addShortcut, pushRecent, readPrefs, removeShortcut} from '../server/prefs'
import {db, type LocalNote} from '../replica/db'
import {onChange} from '../replica/bus'
import {replayJournal} from '../replica/local'
import {toNote, toNotebook} from './note-docs'
import type {Library, Note, Prefs} from './model'

const fetchPrefs = createServerFn({method: 'GET'}).handler(() => readPrefs())

const pushRecentFn = createServerFn({method: 'POST'})
  .validator((id: string) => id)
  .handler(({data}) => pushRecent(data))
const starFn = createServerFn({method: 'POST'})
  .validator((d: {id: string; on: boolean}) => d)
  .handler(({data}) => (data.on ? addShortcut : removeShortcut)(data.id))

const local = {staleTime: Infinity, networkMode: 'always'} as const
const keepLocal = () => undefined
const otherTab = new Map<string, number>()
const asNote = (d: LocalNote): Note => ({...toNote(d), gen: (d._gen ?? 0) + (otherTab.get(d._id) ?? 0)})

async function readLibrary(): Promise<Library> {
  await replayJournal()
  const d = await db()
  const [notes, notebooks] = await Promise.all([d.getAll('notes'), d.getAll('notebooks')])
  return {notes: notes.map(asNote), notebooks: notebooks.map(toNotebook)}
}

export const libraryQuery = queryOptions({...local, queryKey: ['library'], queryFn: readLibrary})
export const stuckQuery = queryOptions({...local, queryKey: ['stuck'], queryFn: async () => (await (await db()).getAll('outbox')).flatMap((e) => (e.failed ? [{id: e.id, why: e.failed.why}] : []))})

type Stars = Record<string, boolean>
const STARS = 'stars'

const withStars = (list: string[], stars: Stars) => [...list.filter((x) => stars[x] !== false), ...Object.keys(stars).filter((x) => stars[x] && !list.includes(x))]
const pendingStars = async () => ((await (await db()).get('meta', STARS)) as Stars | undefined) ?? {}

async function editStars(edit: (s: Stars) => void) {
  const tx = (await db()).transaction('meta', 'readwrite')
  const stars = ((await tx.store.get(STARS)) as Stars | undefined) ?? {}
  edit(stars)
  await tx.store.put(stars, STARS)
  await tx.done
}

async function sendAll(): Promise<string[] | undefined> {
  let shortcuts: string[] | undefined
  for (const [id, on] of Object.entries(await pendingStars())) {
    shortcuts = await starFn({data: {id, on}})
    await editStars((s) => s[id] === on && delete s[id])
  }
  const d = await db()
  const cached = (await d.get('meta', 'prefs')) as Prefs | undefined
  if (shortcuts && cached) await d.put('meta', {...cached, shortcuts}, 'prefs')
  return shortcuts
}

let sending: Promise<string[] | undefined> = Promise.resolve(undefined)
const sendStars = () => (sending = sending.then(sendAll, sendAll))

async function loadPrefs(): Promise<Prefs> {
  const d = await db()
  await sendStars().catch(keepLocal)
  let prefs: Prefs
  try {
    prefs = await fetchPrefs()
    await d.put('meta', prefs, 'prefs')
  } catch {
    prefs = ((await d.get('meta', 'prefs')) as Prefs | undefined) ?? {shortcuts: [], recents: []}
  }
  return {...prefs, shortcuts: withStars(prefs.shortcuts, await pendingStars())}
}

export const prefsQuery = queryOptions({queryKey: ['prefs'], staleTime: 30_000, networkMode: 'always', queryFn: loadPrefs})

export async function refresh(qc: QueryClient, ids: string[]) {
  const d = await db()
  const [docs, notebooks] = await Promise.all([Promise.all(ids.map((id) => d.get('notes', id))), d.getAll('notebooks')])
  const fresh = docs.filter((x): x is LocalNote => !!x).map(asNote)
  qc.setQueryData<Library>(libraryQuery.queryKey, (lib) => lib && {notes: [...fresh, ...lib.notes.filter((n) => !ids.includes(n.id))], notebooks: notebooks.map(toNotebook)})
  void qc.invalidateQueries({queryKey: stuckQuery.queryKey})
}

export const followReplica = (qc: QueryClient) =>
  onChange(({kind, ids, tab}) => {
    if (tab && kind === 'local') for (const id of ids) otherTab.set(id, (otherTab.get(id) ?? 0) + 1)
    void refresh(qc, ids)
  })

const setPrefs = (qc: QueryClient, patch: Partial<Prefs>) => qc.setQueryData<Prefs>(prefsQuery.queryKey, (p) => p && {...p, ...patch})

export function rememberRecent(qc: QueryClient, id: string) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p?.recents[0] === id) return
  if (p) setPrefs(qc, {recents: [id, ...p.recents.filter((x) => x !== id)]})
  pushRecentFn({data: id}).then((recents) => setPrefs(qc, {recents}), keepLocal)
}

export function star(qc: QueryClient, id: string, on: boolean) {
  const p = qc.getQueryData<Prefs>(prefsQuery.queryKey)
  if (p) setPrefs(qc, {shortcuts: withStars(p.shortcuts, {[id]: on})})
  void editStars((s) => (s[id] = on))
    .then(sendStars)
    .then(async (sent) => sent && setPrefs(qc, {shortcuts: withStars(sent, await pendingStars())}), keepLocal)
}

export function sendStarsOnReconnect(qc: QueryClient) {
  const send = () => void qc.invalidateQueries({queryKey: prefsQuery.queryKey})
  addEventListener('online', send)
  return () => removeEventListener('online', send)
}
