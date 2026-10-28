import {queryOptions} from '@tanstack/react-query'
import {createServerFn} from '@tanstack/react-start'
import {listNoteRows} from '../server/notes'
import type {NoteRow} from '../server/note-rows'

const fetchNoteRows = createServerFn({method: 'GET'}).handler(() => listNoteRows())

export const noteRowsQuery = queryOptions({queryKey: ['note-rows'], staleTime: 5_000, queryFn: (): Promise<NoteRow[]> => fetchNoteRows()})
