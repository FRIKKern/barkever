import {fixtureNotes, plain, stamp, type Block, type Inline, type Note} from './data'

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generate(n: number): Note[] {
  if (n <= fixtureNotes.length) return fixtureNotes.slice(0, n)
  const rand = mulberry32(42)
  const vocab = [...new Set(fixtureNotes.flatMap((x) => (x.title + ' ' + plain(x.body)).toLowerCase().match(/[a-z]{4,}/g) ?? []))]
  const pick = () => vocab[Math.floor(rand() * vocab.length)]
  const sentence = (k: number) => {
    const w = Array.from({length: k}, pick).join(' ')
    return w[0].toUpperCase() + w.slice(1) + '.'
  }
  const T = fixtureNotes.length
  const genId = (i: number) => `fx-gen-${String(i).padStart(4, '0')}`
  return Array.from({length: n}, (_, i) => {
    const t = fixtureNotes[i % T]
    const id = genId(i)
    const map = (ref: string) => genId(Math.floor(i / T) * T + Number(ref.slice('fx-note-'.length)))
    const remap = (xs: Inline[]): Inline[] => xs.map((x) => (x.type === 'text' ? x : {...x, target: map(x.target), docId: map(x.docId), children: remap(x.children)}))
    const blocks: Block[] = t.body.blocks.map((b) => ({...b, id: b.id.replace(t._id, id), ...(b.type === 'paragraph' ? {content: remap(b.content)} : {})}) as Block)
    const extra = 2 + Math.floor(rand() * 5)
    for (let j = 0; j < extra; j++) blocks.push({id: `${id}-x${j}`, type: 'paragraph', content: [{type: 'text', value: sentence(15 + Math.floor(rand() * 25))}]})
    return {
      _id: id, _type: 'note', title: `${t.title} ${pick()} ${i}`, notebook: t.notebook, tags: t.tags,
      body: {blocks}, links: t.links.map((l) => ({_ref: map(l._ref), _key: map(l._ref)})), _updatedAt: stamp(i),
    }
  })
}
