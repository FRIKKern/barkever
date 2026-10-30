import type {Block, Inline} from './model.ts'

const text = (value: string): Inline => ({type: 'text', value})

export const HOLDING: [string, Block[]][] = [
  ['only bold text', [{id: 'p', type: 'paragraph', content: [{type: 'strong', children: [text('Buy rope')]}]}]],
  ['only inline code', [{id: 'p', type: 'paragraph', content: [{type: 'code', value: 'knot()'}]}]],
  ['only an image', [{id: 'i', type: 'image'} as Block]],
  ['only a link with no children', [{id: 'p', type: 'paragraph', content: [{type: 'wikilink', docId: 'pier'}]}]],
  ['only words in a nested list item', [{id: 'l', type: 'list', items: [{content: [], children: [{id: 'c', type: 'paragraph', content: [text('Nested rope')]}]} as never]}]],
  ['only an inline with neither value nor children', [{id: 'p', type: 'paragraph', content: [{type: 'tag'}]}]],
  ['a heading whose text is empty and whose content holds words', [{id: 'h', type: 'heading', level: 2, text: '', content: [text('Winter plan')]}]],
  ['a block of a type nobody knows', [{id: 'x', type: 'callout'}]],
]

export const BLANK: [string, Block[]][] = [
  ['an empty paragraph', [{id: 'p', type: 'paragraph', content: []}]],
  ['spaces only', [{id: 'p', type: 'paragraph', content: [text('   ')]}]],
  ['bold spaces', [{id: 'p', type: 'paragraph', content: [{type: 'strong', children: [text(' ')]}]}]],
  ['an empty heading', [{id: 'h', type: 'heading', level: 2, text: '', content: []}]],
  ['a list of empty items', [{id: 'l', type: 'list', ordered: true, items: [[], {content: [], checked: false}]}]],
]
