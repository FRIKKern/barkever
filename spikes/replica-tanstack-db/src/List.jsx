import { useLayoutEffect } from 'react'
import { like, useLiveQuery } from '@tanstack/react-db'
import { marks, notes } from './db.js'
import { afterFrame, settle, start } from './timing.js'

export function List({ term, selected, onSelect }) {
  const needle = term.toLowerCase()
  const { data = [] } = useLiveQuery(
    (q) => {
      const from = q.from({ n: notes })
      const hits = needle ? from.where(({ n }) => like(n.text, `%${needle}%`)) : from
      return hits.orderBy(({ n }) => n.title, 'asc').limit(100).select(({ n }) => ({ _id: n._id, title: n.title }))
    },
    [needle],
  )
  useLayoutEffect(() => {
    if (data.length && !marks.firstList) {
      marks.firstList = performance.now()
      afterFrame(() => (marks.firstListFrame = performance.now()))
    }
    settle('search', (p) => p.term === term)
  })
  return (
    <ul id="list" data-count={data.length}>
      {data.map((n) => (
        <li key={n._id}>
          <button onClick={(e) => { start('switch', e, { id: n._id }); onSelect(n._id) }}>
            {n._id === selected ? '▶ ' : ''}{n.title || 'Untitled'}
          </button>
        </li>
      ))}
    </ul>
  )
}
