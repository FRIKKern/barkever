import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeLocal} from './merge.ts'
import {rewrite} from '../lib/ai-edit.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const note = (blocks: Block[]): NoteDoc => ({_id: 'n1', _type: 'note', title: 'Plan', tags: [], links: [], body: {blocks}, _rev: 'r1'})
const merged = (stored: Block[], shown: Block[], after: Block[]) => mergeLocal(note(stored), {body: {blocks: shown}}, {body: {blocks: after}}, '2026-10-31T12:00:00.000Z', 'local-x', 'me', note(stored))
const texts = (n: NoteDoc) => n.body!.blocks.map(blockText)
const copies = (n: NoteDoc) => (n.conflicts ?? []).map((c) => c.body?.blocks?.map(blockText))

const pre = [p('p0', 'old zero'), p('p1', 'old one')]
const ai = {block: 'p0', after: 'AI zero'}

test('an AI accept diffs from what the user saw, so another device typing into that block keeps its words in a conflict copy', () => {
  const now = [p('p0', 'old zero REMOTE'), p('p1', 'old one')]
  const n = merged(now, pre, rewrite(pre, ai))
  assert.deepEqual(texts(n), ['AI zero', 'old one'])
  assert.deepEqual(copies(n), [['old zero REMOTE', 'old one']])
})

test('an AI undo takes back only the accepted change, so another device typing into another block keeps its words', () => {
  const now = [p('p0', 'AI zero'), p('p1', 'old one REMOTE')]
  const n = merged(now, rewrite(pre, ai), pre)
  assert.deepEqual(texts(n), ['old zero', 'old one REMOTE'])
  assert.deepEqual(copies(n), [])
})
