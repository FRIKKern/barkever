import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validate} from 'portable-doc/packages/validate/index.js'
import {fileNames, toMarkdown} from './markdown-out.ts'
import {fromMarkdown, sortFiles, type Read} from './markdown-in.ts'
import {titleIn, type Block, type Inline, type Note} from './model.ts'

const text = (value: string): Inline => ({type: 'text', value})
const wrap = (type: string, ...children: Inline[]): Inline => ({type, children})
const note = (id: string, title: string, blocks: Block[], tags: string[] = []): Note => ({id, title, notebook: 'nb', tags, blocks, links: [], updatedAt: '2026-11-01', rev: 'r', conflicts: [], gen: 0})

const pier = note('pier', 'Pier walk', [])
const plan = note(
  'plan',
  'Boat plan',
  [
    {id: 'h', type: 'heading', level: 2, content: [text('Before we sail')]},
    {
      id: 'p',
      type: 'paragraph',
      content: [
        text('Buy '),
        wrap('strong', text('rope')),
        text(', '),
        wrap('em', text('chain '), wrap('strong', text('links'))),
        text(', '),
        {type: 'code', value: 'knot()'},
        text(', '),
        wrap('strikethrough', text('net')),
        text(', '),
        wrap('underline', text('buoy')),
        text(', '),
        {type: 'link', href: 'https://example.com/dock', children: [text('the dock')]} as Inline,
        text(' near '),
        {type: 'wikilink', target: 'Pier walk', docId: 'pier', children: [text('Pier walk')]},
        text('. 2 * 3 = 6, snake_case, [brackets] and a #hash.'),
      ],
    },
    {
      id: 'l',
      type: 'list',
      ordered: false,
      items: [
        {content: [text('Hull')]},
        {content: [text('Sails')], children: [{id: 'l2', type: 'list', ordered: true, start: 3, items: [{content: [text('Main')]}, {content: [wrap('em', text('Jib'))]}]}]},
      ],
    },
    {id: 't', type: 'list', ordered: false, task: true, items: [{content: [text('Check the engine')], checked: true}, {content: [text('Fill the tank')], checked: false, children: [{id: 't2', type: 'list', ordered: false, task: true, items: [{content: [text('Diesel')], checked: false}]}]}]},
    {id: 'c', type: 'code', lang: 'sh', value: 'echo "```"\nls -la'} as Block,
    {id: 'q', type: 'pullquote', content: [text('Fair winds')]},
    {id: 'n', type: 'list', ordered: true, items: [{content: [text('One')]}, {content: [text('Two')]}]},
    {id: 'h1', type: 'heading', level: 1, content: [text('# Not a title')]},
    {id: 'p2', type: 'paragraph', content: [text('- not a list, 1. not a number')]},
  ],
  ['boat', 'with space'],
)
const byId = new Map([pier, plan].map((n) => [n.id, n]))
const title = titleIn(byId)
const byTitle = (t: string) => [...byId.values()].find((n) => n.title.toLowerCase() === t.toLowerCase())?.id

const counter = () => {
  let n = 0
  return () => `b${++n}`
}
const read = (fallback = 'From file'): Read => ({fallback, id: counter(), resolve: byTitle})
const noIds = (x: unknown): unknown => (Array.isArray(x) ? x.map(noIds) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id').map(([k, v]) => [k, noIds(v)])) : x)
const clean = (blocks: Block[]) => assert.deepEqual(validate({blocks}), {ok: true})

test('a note goes out as Markdown and comes back as the same body, title and tags', () => {
  const md = toMarkdown(plan, {title, notebook: 'Sea'})
  const back = fromMarkdown(md, read())
  assert.equal(back.title, 'Boat plan')
  assert.deepEqual(back.tags, ['boat', 'with space'])
  assert.deepEqual(noIds(back.blocks), noIds(plan.blocks))
  clean(back.blocks)
  const ids = JSON.stringify(back.blocks).match(/"id":"[^"]+"/g)!
  assert.equal(new Set(ids).size, 11)
})

test('the Markdown reads like Markdown: front matter, title, marks, lists, tasks, links, code and quote', () => {
  const md = toMarkdown(plan, {title, notebook: 'Sea'})
  assert.equal(
    md,
    [
      '---',
      'tags: ["boat","with space"]',
      'notebook: "Sea"',
      '---',
      '',
      '# Boat plan',
      '',
      '## Before we sail',
      '',
      'Buy **rope**, *chain **links***, `knot()`, ~~net~~, <u>buoy</u>, [the dock](https://example.com/dock) near [[Pier walk]]. 2 \\* 3 = 6, snake\\_case, \\[brackets\\] and a #hash.',
      '',
      '- Hull',
      '- Sails',
      '  3. Main',
      '  4. *Jib*',
      '',
      '- [x] Check the engine',
      '- [ ] Fill the tank',
      '  - [ ] Diesel',
      '',
      '````sh',
      'echo "```"',
      'ls -la',
      '````',
      '',
      '> Fair winds',
      '',
      '1. One',
      '2. Two',
      '',
      '# \\# Not a title',
      '',
      '\\- not a list, 1. not a number',
      '',
    ].join('\n'),
  )
})

test('a renamed link target goes out under its current title, and words that differ keep them as an alias', () => {
  const renamed = note('r', 'Links', [
    {id: 'p', type: 'paragraph', content: [{type: 'wikilink', target: 'Pier', docId: 'pier', children: [text('Pier')]}, text(' and '), {type: 'wikilink', target: 'Pier walk', docId: 'pier', alias: 'the pier', children: [text('the pier')]}, text(' and '), {type: 'wikilink', target: 'Gone', children: [text('Gone')]}]},
  ])
  const md = toMarkdown(renamed, {title})
  assert.match(md, /\[\[Pier walk\]\] and \[\[Pier walk\|the pier\]\] and \[\[Gone\]\]/)
  const back = fromMarkdown(md, read())
  assert.deepEqual(back.blocks[0].content, [
    {type: 'wikilink', target: 'Pier walk', docId: 'pier', children: [text('Pier walk')]},
    text(' and '),
    {type: 'wikilink', target: 'Pier walk', docId: 'pier', alias: 'the pier', children: [text('the pier')]},
    text(' and '),
    {type: 'wikilink', target: 'Gone', children: [text('Gone')]},
  ])
})

test('shapes the editor also stores go out: text fields, bare string items, blockquote, deep headings, divider, image', () => {
  const odd = note('o', 'Odd', [
    {id: 'a', type: 'heading', level: 5, text: 'Deep'},
    {id: 'b', type: 'paragraph', text: 'Plain text field'},
    {id: 'c', type: 'list', items: ['bare', [text('array')]]},
    {id: 'd', type: 'blockquote', content: [text('Quoted')]},
    {id: 'e', type: 'divider'},
    {id: 'f', type: 'image', src: 'https://example.com/a.png', alt: 'A boat'} as Block,
    {id: 'g', type: 'paragraph', content: []},
    {id: 'h', type: 'paragraph', content: [text('line one\nline two')]},
  ])
  assert.equal(toMarkdown(odd, {title}), '# Odd\n\n##### Deep\n\nPlain text field\n\n- bare\n- array\n\n> Quoted\n\n---\n\n![A boat](https://example.com/a.png)\n\nline one\\\nline two\n')
  const back = fromMarkdown(toMarkdown(odd, {title}), read())
  assert.deepEqual(back.blocks.map((b) => [b.type, b.level]), [['heading', 3], ['paragraph', undefined], ['list', undefined], ['pullquote', undefined], ['divider', undefined], ['image', undefined], ['paragraph', undefined]])
  assert.deepEqual(back.blocks[6].content, [text('line one\nline two')])
  clean(back.blocks)
})

test('an empty or untitled note goes out and comes back empty and untitled', () => {
  assert.equal(toMarkdown(note('e', '', []), {title}), '')
  const back = fromMarkdown('', read(''))
  assert.deepEqual(back, {title: '', tags: [], blocks: []})
  const untitled = fromMarkdown(toMarkdown(note('u', '', [{id: 'p', type: 'paragraph', content: [text('Just words')]}]), {title}), read(''))
  assert.equal(untitled.title, '')
  assert.deepEqual(noIds(untitled.blocks), [{type: 'paragraph', content: [text('Just words')]}])
})

test('Windows line ends, no front matter and no heading: the file name is the title', () => {
  const back = fromMarkdown('Some words\r\nmore words\r\n\r\n* one\r\n* [X] two\r\n', read('Shopping'))
  assert.equal(back.title, 'Shopping')
  assert.deepEqual(back.tags, [])
  assert.deepEqual(noIds(back.blocks), [
    {type: 'paragraph', content: [text('Some words more words')]},
    {type: 'list', ordered: false, items: [{content: [text('one')]}]},
    {type: 'list', ordered: false, task: true, items: [{content: [text('two')], checked: true}]},
  ])
})

test('front matter tags in every common spelling, and a heading that is not first stays in the body', () => {
  const tags = (fm: string) => fromMarkdown(`---\n${fm}\n---\nWords\n`, read()).tags
  assert.deepEqual(tags('tags: [a, "b c", #d]'), ['a', 'b c', 'd'])
  assert.deepEqual(tags('tags:\n  - a\n  - b'), ['a', 'b'])
  assert.deepEqual(tags('tags: a, b'), ['a', 'b'])
  assert.deepEqual(tags('title: x\ntags: solo'), ['solo'])
  const late = fromMarkdown('Intro\n\n# Later', read('Name'))
  assert.equal(late.title, 'Name')
  assert.deepEqual(late.blocks.map((b) => b.type), ['paragraph', 'heading'])
})

test('Markdown from other apps: tabs, four-space nesting, lazy lines, setext, numbered with ), tables and loose code', () => {
  const md = ['Title line', '===', '', '1) first', '\tthe rest', '2) second', '    - inner', '    lazy', '', '| a | b |', '|---|---|', '', '~~~', 'a < b', '~~~', 'Sub', '---', '***'].join('\n')
  const back = fromMarkdown(md, read())
  assert.deepEqual(noIds(back.blocks), [
    {type: 'heading', level: 1, content: [text('Title line')]},
    {type: 'list', ordered: true, items: [{content: [text('first the rest')]}, {content: [text('second')], children: [{type: 'list', ordered: false, items: [{content: [text('inner lazy')]}]}]}]},
    {type: 'paragraph', content: [text('| a | b |')]},
    {type: 'paragraph', content: [text('|---|---|')]},
    {type: 'code', value: 'a < b'},
    {type: 'heading', level: 2, content: [text('Sub')]},
    {type: 'divider'},
  ])
  clean(back.blocks)
})

test('inline Markdown that is not ours: underscores, autolinks, images in text, unclosed marks and escapes', () => {
  const [p] = fromMarkdown('__bold__ _it_ a_b_c <https://example.com> ![pic](https://example.com/p.png) **open \\*star\\* `` a`b ``', read()).blocks
  assert.deepEqual(p.content, [
    wrap('strong', text('bold')),
    text(' '),
    wrap('em', text('it')),
    text(' a_b_c '),
    {type: 'link', href: 'https://example.com', children: [text('https://example.com')]},
    text(' '),
    {type: 'link', href: 'https://example.com/p.png', children: [text('pic')]},
    text(' **open *star* '),
    {type: 'code', value: 'a`b'},
  ])
})

test('a link to a note being imported in the same batch, or one that exists by another case, resolves', () => {
  const resolve = (t: string) => ({'pier walk': 'pier', 'new one': 'note-new'})[t.toLowerCase()]
  const [p] = fromMarkdown('[[PIER WALK]] [[New one]] [[Nowhere]]', {fallback: '', id: counter(), resolve}).blocks
  assert.deepEqual(p.content!.filter((x) => x.type === 'wikilink').map((x) => x.docId), ['pier', 'note-new', undefined])
})

test('files: Markdown and text are taken, big or other files are skipped with the reason', () => {
  const {take, skip} = sortFiles([
    {name: 'a.md', size: 10},
    {name: 'b.MARKDOWN', size: 10},
    {name: 'c.txt', size: 10},
    {name: 'd.pdf', size: 10},
    {name: 'e.md', size: 10_000_000},
  ])
  assert.deepEqual(take.map((f) => f.name), ['a.md', 'b.MARKDOWN', 'c.txt'])
  assert.deepEqual(skip, [
    {name: 'd.pdf', why: 'not Markdown'},
    {name: 'e.md', why: 'over 256 KB'},
  ])
})

test('notebook files get safe, unique names, unicode kept', () => {
  assert.deepEqual(fileNames(['Plan', 'plan', 'a/b: c?', '', '  ', 'Øl på brygga', '.hidden']), ['Plan.md', 'plan 2.md', 'a-b- c-.md', 'Untitled.md', 'Untitled 2.md', 'Øl på brygga.md', 'hidden.md'])
})
