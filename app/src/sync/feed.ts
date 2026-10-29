import {db} from '../replica/db'
import {settle, type Decide} from '../replica/settle'
import {bare, fromServer, type DocType} from '../replica/note'
import type {Frame} from './stream'

const MARGIN = 100_000
const TYPES = new Set<string>(['note', 'notebook'])

export type Feed = {since: number | null; onFrame: (f: Frame) => void; drained: () => Promise<void>}

const decideFor = (f: Frame): Decide => {
  const prev = f.previousRev ?? undefined
  if (f.mutation === 'delete') return (known) => (known === undefined ? 'skip' : known === prev ? 'apply' : 'suspect')
  return (known) => (known === f.rev ? 'skip' : known === prev ? 'apply' : 'suspect')
}

export async function openFeed(onSuspect: (type: DocType, id: string) => void): Promise<Feed> {
  const d = await db()
  let cursor = ((await d.get('meta', 'cursor')) as number | undefined) ?? null
  const seen = new Set(((await d.get('meta', 'seen')) as number[] | undefined) ?? [])
  let chain = Promise.resolve()
  let saving: ReturnType<typeof setTimeout> | undefined

  const save = () => {
    clearTimeout(saving)
    saving = setTimeout(() => {
      const floor = (cursor ?? 0) - MARGIN
      for (const id of seen) if (id <= floor) seen.delete(id)
      const tx = d.transaction('meta', 'readwrite')
      void tx.store.put(cursor, 'cursor')
      void tx.store.put([...seen], 'seen')
    }, 300)
  }

  const apply = async (f: Frame) => {
    if (seen.has(f.eventId)) return
    if (TYPES.has(f.type)) {
      const type = f.type as DocType
      const id = bare(f.documentId)
      const verdict = await settle(type, id, f.mutation === 'delete' ? null : fromServer(f.result), decideFor(f))
      if (verdict === 'suspect') onSuspect(type, id)
    }
    seen.add(f.eventId)
    cursor = Math.max(cursor ?? 0, f.eventId)
    save()
  }

  return {
    since: cursor === null ? null : Math.max(0, cursor - MARGIN),
    onFrame: (f) => void (chain = chain.then(() => apply(f)).catch((e) => console.warn('sync frame', e))),
    drained: () => chain,
  }
}
