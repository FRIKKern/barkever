import { useEffect, useState } from 'react'
import { SET, notes } from './db.js'
import { executor, stats } from './outbox.js'
import { start } from './timing.js'
import { List } from './List.jsx'
import { Note } from './Note.jsx'

function Status() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 250)
    return () => clearInterval(t)
  }, [])
  return (
    <p id="status">
      set {SET} · {notes.size} notes · outbox {executor.getPendingCount()} · pushed {stats.pushes} · conflicts {stats.conflicts} · online {String(executor.isOnline())}
    </p>
  )
}

export function App() {
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState(null)
  return (
    <div>
      <Status />
      <input id="search" placeholder="search" value={term} onChange={(e) => { start('search', e, { term: e.target.value }); setTerm(e.target.value) }} />
      <div style={{ display: 'flex', gap: 16 }}>
        <List term={term} selected={selected} onSelect={setSelected} />
        {selected && <Note id={selected} />}
      </div>
    </div>
  )
}
