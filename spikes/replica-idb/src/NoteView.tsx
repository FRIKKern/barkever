import {useLayoutEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {edit, noteQuery, outboxQuery} from './replica'
import {push, settle, wait} from './metrics'
import {bodyFromText, plain, type Note} from './data'

function Editor({note}: {note: Note}) {
  const [title, setTitle] = useState(note.title)
  const [text, setText] = useState(() => plain(note.body))
  const conflict = useQuery(outboxQuery).data?.find((e) => e.docId === note._id)?.conflict
  useLayoutEffect(() => {
    if (wait.ks?.value === title) push('ksInput', performance.now() - wait.ks.t0)
  }, [title])
  return (
    <div>
      <input
        id="title" value={title} style={{width: 500}}
        onChange={(e) => {
          wait.ks = {value: e.target.value, t0: e.timeStamp}
          setTitle(e.target.value)
          edit(note._id, {title: e.target.value}, e.timeStamp)
        }}
      />
      <br />
      <textarea id="body" value={text} rows={20} cols={70} onChange={(e) => (setText(e.target.value), edit(note._id, {body: bodyFromText(note._id, e.target.value)}))} />
      {conflict && <pre id="conflict">Conflict, theirs: {JSON.stringify(conflict).slice(0, 300)}</pre>}
    </div>
  )
}

export function NoteView({id}: {id: string}) {
  const {data} = useQuery(noteQuery(id))
  useLayoutEffect(() => {
    const o = wait.open
    if (o && data && o.id === data._id) (wait.open = undefined), settle('switch', o.t0)
  }, [data])
  return data ? <Editor key={data._id} note={data} /> : <div>Loading…</div>
}
