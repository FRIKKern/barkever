import {test} from 'node:test'
import assert from 'node:assert/strict'
import {wordDiff} from './word-diff.ts'

const marked = (a: string, b: string) => wordDiff(a, b).map((p) => (p.kind === 'same' ? p.text : p.kind === 'del' ? `[-${p.text}-]` : `{+${p.text}+}`)).join(' ')

test('a word diff marks what went and what came, in reading order, and joins runs', () => {
  assert.equal(marked('Goals for the Harbor site redesign: one clear call.', 'Goals for the Harbor redesign: one call.'), 'Goals for the Harbor [-site-] redesign: one [-clear-] call.')
  assert.equal(marked('Owner: Ola. Deadline end of quarter.', 'Owner: Ola. Due end of quarter.'), 'Owner: Ola. [-Deadline-] {+Due+} end of quarter.')
  assert.equal(marked('a b c', 'x y'), '[-a b c-] {+x y+}')
  assert.equal(marked('same  text', 'same text'), 'same text')
  assert.equal(marked('', 'new words'), '{+new words+}')
  assert.equal(marked('old words', ''), '[-old words-]')
})
