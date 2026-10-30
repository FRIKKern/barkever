import {test} from 'node:test'
import assert from 'node:assert/strict'
import {isBlank, type Block, type Note} from './model.ts'
import {BLANK, HOLDING} from './blank-shapes.ts'

const note = (blocks: Block[]): Note => ({id: 'n', title: '', notebook: null, tags: [], blocks, links: [], updatedAt: '', rev: '', conflicts: [], gen: 0})

for (const [what, blocks] of HOLDING) test(`a note holding ${what} is not blank`, () => assert.equal(isBlank(note(blocks)), false))

for (const [what, blocks] of BLANK) test(`a note holding ${what} is blank`, () => assert.equal(isBlank(note(blocks)), true))

test('a title alone makes a note not blank', () => assert.equal(isBlank({...note([]), title: 'Plan'}), false))
