import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const fixtures = readFileSync(new URL('../../fixtures/notes.ndjson', here), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const notebooks = fixtures.filter((d) => d._type === 'notebook')
const notes = fixtures.filter((d) => d._type === 'note')

let s = 0x5eed0e
const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]

const plain = (n) => (n.body?.blocks ?? []).flatMap((b) => b.text ? [b.text] : (b.content ?? []).filter((c) => c.type === 'text').map((c) => c.value))
const sentences = notes.flatMap(plain).filter((t) => t.length > 12)
const titleWords = [...new Set(notes.flatMap((n) => n.title.split(/[\s:,]+/)).filter((w) => w.length > 3))]
const tags = [...new Set(notes.flatMap((n) => n.tags))]
const text = (value) => ({ type: 'text', value })

const out = []
const N = 5000
for (let i = 0; i < N; i++) {
  const id = `gen-note-${String(i).padStart(4, '0')}`
  const tpl = notes[i % notes.length]
  const title = `${pick(titleWords)} ${pick(titleWords)} ${i}`
  const blocks = []
  const paras = 2 + Math.floor(rnd() * 5)
  if (rnd() < 0.3) blocks.push({ id: `${id}-h`, type: 'heading', level: 2, text: pick(titleWords) })
  for (let p = 0; p < paras; p++) blocks.push({ id: `${id}-p${p}`, type: 'paragraph', content: [text(`${pick(sentences)} ${pick(sentences)}`)] })
  if (rnd() < 0.25) blocks.push({ id: `${id}-t`, type: 'list', ordered: false, task: true, items: [0, 1, 2].map(() => ({ content: [text(pick(sentences).slice(0, 40))], checked: rnd() < 0.5 })) })
  const links = []
  if (i > 0 && rnd() < 0.3) {
    const target = `gen-note-${String(Math.floor(rnd() * i)).padStart(4, '0')}`
    blocks.push({ id: `${id}-l`, type: 'paragraph', content: [text('See '), { type: 'wikilink', target, docId: target, children: [text(target)] }, text('.')] })
    links.push({ _ref: target, _key: target })
  }
  out.push({ _type: 'note', _id: id, title, notebook: tpl.notebook, tags: [pick(tags), pick(tags)].filter((t, k, a) => a.indexOf(t) === k), body: { blocks }, links })
}

mkdirSync(new URL('data/', here), { recursive: true })
const nd = (docs) => docs.map((d) => JSON.stringify(d)).join('\n') + '\n'
writeFileSync(new URL('data/notes-50.ndjson', here), nd([...notebooks, ...notes]))
writeFileSync(new URL('data/notes-5000.ndjson', here), nd(out))
console.log(`gen: ${notes.length} fixture notes, ${notebooks.length} notebooks, ${out.length} generated notes`)
