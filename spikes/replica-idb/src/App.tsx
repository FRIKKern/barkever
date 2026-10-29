import {useEffect, useLayoutEffect, useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {db, editMany, N, notebooksQuery, outboxQuery, rowsQuery} from './replica'
import {sync, upload, type SyncResult} from './sync'
import {afterPaint, metrics, settle, wait} from './metrics'
import {search} from './search'
import {List} from './List'
import {NoteView} from './NoteView'

export function App() {
  const {data: rows} = useQuery(rowsQuery)
  const {data: nbs} = useQuery(notebooksQuery)
  const {data: outbox} = useQuery(outboxQuery)
  const [selected, setSelected] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [last, setLast] = useState<SyncResult | null>(null)
  const byId = useMemo(() => new Map(rows?.map((r) => [r.id, r])), [rows])
  const hits = useMemo(() => (q.trim() ? search(q).flatMap((id) => byId.get(id) ?? []) : null), [q, byId])
  const open = (id: string) => ((wait.open = {id, t0: performance.now()}), setSelected(id))
  const report = (go: () => Promise<SyncResult>) => async () => {
    const r = await go()
    setLast(r)
    return r
  }

  useEffect(() => {
    Object.assign(window, {
      __spike: {open, selected, metrics, editMany, sync: report(sync), upload: report(upload), ids: () => rows?.map((r) => r.id) ?? [], outboxSize: async () => (await db()).count('outbox')},
    })
  })
  useLayoutEffect(() => {
    if (rows?.length && metrics.firstList === undefined) {
      metrics.firstList = performance.now()
      afterPaint(() => (metrics.firstListPaint = performance.now()))
    }
  }, [rows])
  useLayoutEffect(() => {
    const s = wait.search
    if (s?.q === q) (wait.search = undefined), (metrics.lastHits = hits?.length ?? 0), settle('search', s.t0)
  }, [q])

  return (
    <div>
      <div>
        n={N} · rows={rows?.length ?? '…'} · outbox={outbox?.length ?? '…'} <button onClick={report(sync)}>Sync</button> {last && JSON.stringify(last)}
      </div>
      <input id="search" placeholder="Search" value={q} onChange={(e) => ((wait.search = {q: e.target.value, t0: e.timeStamp}), setQ(e.target.value))} />
      <div style={{display: 'flex', gap: 16}}>
        {rows ? <List rows={hits ?? rows} selected={selected} onOpen={open} nbs={nbs} /> : <div>Loading…</div>}
        {selected && <NoteView id={selected} />}
      </div>
    </div>
  )
}
