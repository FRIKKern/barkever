import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readImport, type Picked} from './markdown-import.ts'
import {decodeText, fromMarkdown, type Read} from './markdown-in.ts'
import {toMarkdown} from './markdown-out.ts'
import {titleIn, type Block, type Inline, type Note} from './model.ts'

const text = (value: string): Inline => ({type: 'text', value})
const read = (fallback = 'F'): Read => {
  let n = 0
  return {fallback, id: () => `b${++n}`, resolve: () => undefined}
}
const note = (id: string, title: string, blocks: Block[] = [], tags: string[] = []): Note => ({id, title, notebook: 'nb', tags, blocks, links: [], updatedAt: '2026-11-01', rev: 'r', conflicts: [], gen: 0})
const KB256 = 256 * 1024
const fill = (unit: string) => unit.repeat(Math.floor(KB256 / unit.length))
const file = (name: string, bytes: Uint8Array): Picked => ({name, size: bytes.length, bytes: async () => bytes})
const utf8 = (s: string) => new TextEncoder().encode(s)

test('256 KB of unclosed marks, brackets, ticks and links parses in linear time', () => {
  for (const unit of ['**a ', '*a ', '_a ', '~~a ', '[a ', '[[a ', '`a ', '<u>a ', '[a](b', '<a:b', '*a_ ', '**a *b ', '# a #', '![a](b']) {
    const src = fill(unit)
    const ms = Math.min(
      ...[1, 2, 3].map(() => {
        const t = performance.now()
        fromMarkdown(src, read())
        return performance.now() - t
      }),
    )
    assert.ok(ms < 200, `${JSON.stringify(unit)} took ${ms.toFixed(0)} ms`)
  }
})

test('marks still pair the way they read: nested, adjacent and mixed with unclosed ones', () => {
  const [p] = fromMarkdown('**a *b*** *c* **d _e_** **open *f*', read()).blocks
  assert.deepEqual(p.content, [
    {type: 'strong', children: [text('a '), {type: 'em', children: [text('b')]}]},
    text(' '),
    {type: 'em', children: [text('c')]},
    text(' '),
    {type: 'strong', children: [text('d '), {type: 'em', children: [text('e')]}]},
    text(' **open '),
    {type: 'em', children: [text('f')]},
  ])
})

test('only UTF-8 text without NUL is read: UTF-16, binary and bad bytes are not', () => {
  assert.equal(decodeText(utf8('﻿# Hi\nthere')), '# Hi\nthere')
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x23, 0x00])), null)
  assert.equal(decodeText(utf8('a\u0000b')), null)
  assert.equal(decodeText(new Uint8Array([0x61, 0xc3])), null)
})

test('an import reads each file once, skips what is not text or not valid, and links only to notes that will exist', async () => {
  let k = 0
  const deep = Array.from({length: 120}, (_, d) => `${'  '.repeat(d)}- level`).join('\n')
  const {ready, skip} = await readImport(
    [
      file('A.md', utf8('# Alpha\n\nSee [[Beta]], [[Old note]], [[Skipped]] and [[Nowhere]].')),
      file('Beta.md', utf8('Body')),
      file('Skipped.md', utf8(`# Skipped\n\n${deep}`)),
      file('wide.txt', new Uint8Array([0xff, 0xfe, 0x48, 0x00])),
      file('nul.md', utf8('a\u0000b')),
    ],
    [note('old', 'Old note')],
    () => `note-${++k}`,
  )
  assert.deepEqual(
    ready.map((r) => [r.id, r.title]),
    [
      ['note-1', 'Alpha'],
      ['note-2', 'Beta'],
    ],
  )
  assert.deepEqual(skip, [
    {name: 'Skipped.md', why: 'could not be read'},
    {name: 'wide.txt', why: 'not text'},
    {name: 'nul.md', why: 'not text'},
  ])
  const links = ready[0].blocks[0].content!.filter((x) => x.type === 'wikilink')
  assert.deepEqual(
    links.map((x) => [x.target, x.docId]),
    [
      ['Beta', 'note-2'],
      ['Old note', 'old'],
      ['Skipped', undefined],
      ['Nowhere', undefined],
    ],
  )
})

test('script and data link targets come in as plain words', () => {
  const [p, img] = fromMarkdown('[x](javascript:alert(1)) <javascript:alert(2)> [y](data:text/html,hi) [ok](https://example.com)\n\n![pic](javascript:alert(3))', read()).blocks
  assert.deepEqual(p.content, [text('x javascript:alert(2) y '), {type: 'link', href: 'https://example.com', children: [text('ok')]} as Inline])
  assert.deepEqual(img.content, [text('pic')])
})

test('round trips at the edges: tags with commas, image alt with a bracket, a heading ending in #, empty front matter, a bare # line', () => {
  const odd = note('o', 'Odd', [{id: 'h', type: 'heading', level: 2, content: [text('Notes #')]}, {id: 'i', type: 'image', src: 'https://example.com/a.png', alt: 'a]b'} as Block], ['a, b', 'c'])
  const back = fromMarkdown(toMarkdown(odd, {title: titleIn(new Map())}), read())
  assert.deepEqual(back.tags, ['a, b', 'c'])
  assert.deepEqual(back.blocks[0].content, [text('Notes #')])
  assert.equal((back.blocks[1] as {alt?: string}).alt, 'a]b')
  assert.deepEqual(fromMarkdown('---\n---\n# T\nWords', read()).blocks.map((b) => b.type), ['paragraph'])
  assert.equal(fromMarkdown('# \n\nWords', read('From name')).title, 'From name')
})
