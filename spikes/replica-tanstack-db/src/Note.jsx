import { useEffect, useLayoutEffect } from 'react'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { notes } from './db.js'
import { edit, flush } from './outbox.js'
import { bodyText, textBody } from './text.js'
import { settle, start } from './timing.js'

export function Note({ id }) {
  const { data: note } = useLiveQuery((q) => q.from({ n: notes }).where(({ n }) => eq(n._id, id)).findOne(), [id])
  const body = note ? bodyText(note.body) : ''
  useLayoutEffect(() => {
    if (!note) return
    settle('switch', (p) => p.id === note._id)
    settle('key', (p) => p.id === note._id && (p.value === note.title || p.value === body))
  })
  useEffect(() => flush, [id])
  if (!note) return <p id="note">No note</p>
  const type = (e, fields) => { start('key', e, { id, value: e.target.value }); edit(id, fields) }
  return (
    <div id="note" data-id={note._id} data-rev={note._rev}>
      <input id="title" value={note.title} onChange={(e) => type(e, { title: e.target.value })} />
      <br />
      <textarea id="body" rows={16} cols={80} value={body} onChange={(e) => type(e, { body: textBody(id, e.target.value) })} />
    </div>
  )
}
