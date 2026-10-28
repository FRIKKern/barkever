import {useSuspenseQuery} from '@tanstack/react-query'
import {createFileRoute} from '@tanstack/react-router'
import {noteRowsQuery} from '../lib/notes'

export const Route = createFileRoute('/')({
  loader: ({context}) => context.queryClient.ensureQueryData(noteRowsQuery),
  component: NoteList,
})

function NoteList() {
  const {data: rows} = useSuspenseQuery(noteRowsQuery)
  return (
    <main>
      <h1>Notes ({rows.length})</h1>
      <ul data-testid="note-list">
        {rows.map((r) => (
          <li key={r.id} data-testid="note-row">
            <span data-testid="note-title">{r.title}</span> · <span data-testid="note-notebook">{r.notebook}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
