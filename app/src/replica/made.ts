import {isBlank} from '../lib/model.ts'
import {toNote} from '../lib/note-docs.ts'
import {db} from './db.ts'
import type {NoteDoc} from './note.ts'
import {writerOf} from './sign.ts'

export const madeKey = (id: string) => `made:${id}`

export const markMade = async (id: string) => void (await (await db()).put('meta', true, madeKey(id)))

export const unmark = async (id: string) => (await db()).delete('meta', madeKey(id))

export const touchedByOthers = (theirs: NoteDoc | null, me: string) => !!theirs && writerOf(theirs) !== me

export const empty = (doc: NoteDoc) => !doc.conflicts?.length && isBlank(toNote(doc))

export const droppable = async (doc: NoteDoc) => empty(doc) && (!doc._rev || (await (await db()).get('meta', madeKey(doc._id))) === true)
