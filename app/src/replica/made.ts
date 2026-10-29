import {isBlank} from '../lib/model.ts'
import {toNote} from '../lib/note-docs.ts'
import {db} from './db.ts'
import type {NoteDoc} from './note.ts'
import {writerOf} from './sign.ts'

const key = (id: string) => `made:${id}`

export const markMade = async (id: string) => void (await (await db()).put('meta', true, key(id)))

export const unmark = async (id: string) => (await db()).delete('meta', key(id))

export const touchedByOthers = (theirs: NoteDoc | null, me: string) => !!theirs && writerOf(theirs) !== me

export const empty = (doc: NoteDoc) => !doc.conflicts?.length && isBlank(toNote(doc))

export const droppable = async (doc: NoteDoc) => empty(doc) && (!doc._rev || (await (await db()).get('meta', key(doc._id))) === true)
