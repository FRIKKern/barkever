import { NonRetriableError, startOfflineExecutor } from '@tanstack/offline-transactions'
import { COMMIT_EACH_KEY, notes, revs } from './db.js'
import { searchText } from './text.js'

export const stats = { pushes: 0, conflicts: 0, failures: 0 }

async function post(mutations) {
  const res = await fetch('/api/mutate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mutations }) })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function push(m) {
  const id = m.key
  const base = m.original?._rev
  const known = revs.get(id)
  const set = { title: m.modified.title, body: m.modified.body }
  let ifRevisionID = known && (known.rev === base || known.mine.includes(base)) ? known.rev : base
  let r = await post([{ patch: { id, type: 'note', set, ifRevisionID } }])
  if (r.status === 412) {
    stats.conflicts++
    ifRevisionID = (await (await fetch(`/api/doc/${encodeURIComponent(id)}`)).json())._rev
    r = await post([{ patch: { id, type: 'note', set, ifRevisionID } }])
  }
  if (r.status >= 500 || r.status === 429) throw new Error(`mutate ${r.status}`)
  if (r.status !== 200) {
    stats.failures++
    throw new NonRetriableError(`mutate ${r.status}`)
  }
  stats.pushes++
  const rev = r.body.results[0].document._rev
  await revs.update(id, (d) => {
    d.mine = [...d.mine, d.rev].slice(-50)
    d.rev = rev
  }).isPersisted.promise
  return { ...m, modified: { ...m.modified, _rev: rev } }
}

async function saveNote({ transaction }) {
  const accepted = []
  for (const m of transaction.mutations.filter((m) => m.collection === notes)) accepted.push(await push(m))
  await notes.utils.acceptMutations({ mutations: accepted })
}

function lastPerNote(txs) {
  const last = new Map(txs.map((tx) => [tx.keys.join(), tx]))
  return txs.filter((tx) => last.get(tx.keys.join()) === tx)
}

export const executor = startOfflineExecutor({ collections: { notes }, mutationFns: { saveNote }, beforeRetry: lastPerNote })

let open = null

export function edit(id, fields) {
  if (open && open.id !== id) flush()
  open ??= { id, tx: executor.createOfflineTransaction({ mutationFnName: 'saveNote', autoCommit: false }) }
  open.tx.mutate(() => notes.update(id, (d) => {
    Object.assign(d, fields)
    d.text = searchText(d)
  }))
  clearTimeout(open.timer)
  if (COMMIT_EACH_KEY) flush()
  else open.timer = setTimeout(flush, 400)
}

export function flush() {
  if (!open) return
  clearTimeout(open.timer)
  open.tx.commit().catch(() => {})
  open = null
}

addEventListener('pagehide', flush)
