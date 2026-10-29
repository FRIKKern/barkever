import { createCollection, createIndexedDB, indexedDBCollectionOptions } from '@tanstack/db'
import { searchText } from './text.js'

const params = new URLSearchParams(location.search)
export const SET = params.get('set') === '5000' ? '5000' : '50'
export const COMMIT_EACH_KEY = params.get('commit') === 'key'
export const marks = { boot: performance.now() }

const db = await createIndexedDB({ name: `barkever-replica-e-${SET}`, version: 1, stores: ['notes', 'revs'] })
export const notes = createCollection(indexedDBCollectionOptions({ db, name: 'notes', id: 'notes', getKey: (n) => n._id }))
export const revs = createCollection(indexedDBCollectionOptions({ db, name: 'revs', id: 'revs', getKey: (r) => r._id }))

export async function ready() {
  await Promise.all([notes.preload(), revs.preload()])
  marks.loaded = performance.now()
  if (notes.size > 0) return
  const rows = await (await fetch(`/api/pull?set=${SET}`)).json()
  marks.fetched = performance.now()
  await notes.utils.importData(rows.map((r) => ({ ...r, text: searchText(r) })))
  await revs.utils.importData(rows.map((r) => ({ _id: r._id, rev: r._rev, mine: [] })))
  marks.pulled = performance.now()
}
