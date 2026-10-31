import {notify} from '../replica/bus'
import {db} from '../replica/db'
import {settle, type Decide} from '../replica/settle'
import {bare, fromServer, type DocType} from '../replica/note'
import {keeper} from './cursor'
import type {Frame} from './stream'

const SAVE_MS = 300
const TYPES = new Set<string>(['note', 'notebook'])

type Feed = {since: number | null; onFrame: (f: Frame) => void; drained: () => Promise<void>; caughtUp: () => void; close: () => void}

const decideFor = (f: Frame): Decide => {
  const prev = f.previousRev ?? undefined
  if (f.mutation === 'delete') return (known) => (known === undefined ? 'skip' : known === prev ? 'apply' : 'suspect')
  return (known) => (known === f.rev ? 'skip' : known === prev ? 'apply' : 'suspect')
}

export async function openFeed(onSuspect: (type: DocType, id: string) => void): Promise<Feed> {
  const d = await db()
  const cursor = keeper(
    {cursor: ((await d.get('meta', 'cursor')) as number | undefined) ?? null, seen: ((await d.get('meta', 'seen')) as number[] | undefined) ?? []},
    () => performance.now(),
  )
  let chain = Promise.resolve()
  let saving: ReturnType<typeof setTimeout> | undefined

  const keep = () => {
    clearTimeout(saving)
    const kept = cursor.keep()
    const tx = d.transaction('meta', 'readwrite')
    void tx.store.put(kept.cursor, 'cursor')
    void tx.store.put(kept.seen, 'seen')
    if (kept.due !== undefined) saving = setTimeout(keep, kept.due)
  }
  const save = () => {
    clearTimeout(saving)
    saving = setTimeout(keep, SAVE_MS)
  }

  let catchingUp = true
  const caught = new Set<string>()

  const apply = async (f: Frame) => {
    if (cursor.seen(f.eventId)) return
    if (TYPES.has(f.type)) {
      const type = f.type as DocType
      const id = bare(f.documentId)
      const verdict = await settle(type, id, f.mutation === 'delete' ? null : fromServer(f.result), decideFor(f), !catchingUp)
      if (verdict === 'suspect') onSuspect(type, id)
      if (verdict === 'apply' && catchingUp) caught.add(id)
    }
    cursor.saw(f.eventId)
    save()
  }

  const caughtUp = () => {
    catchingUp = false
    if (caught.size) notify({kind: 'remote', ids: [...caught]})
    caught.clear()
  }

  return {
    since: cursor.since,
    onFrame: (f) => void (chain = chain.then(() => apply(f)).catch((e) => console.warn('sync frame', e))),
    drained: () => chain,
    caughtUp,
    close: () => {
      cursor.stop()
      caughtUp()
      void chain.then(keep)
    },
  }
}
