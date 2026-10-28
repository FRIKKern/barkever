import {queryOptions} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {listNoteRows} from '../server/notes'
import type {NoteRow} from '../server/note-rows'

// Server function: on the server it calls Barkpark directly (SSR); in the browser it is
// same-origin RPC, so the token never leaves the server.
const fetchNoteRows = createServerFn({method: 'GET'}).handler(() => listNoteRows())

export const noteRowsQuery = queryOptions({queryKey: ['note-rows'], staleTime: 5_000, queryFn: (): Promise<NoteRow[]> => fetchNoteRows()})
