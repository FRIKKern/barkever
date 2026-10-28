// The canvas's write path, over HTTP: a PortableDoc block-op batch on note.body
// (POST …/doc/:ds/note/:id/fields/body/ops, as Studio's lib/blocks.ts applyBlockOps sends it),
// fenced on _rev. Needs "editor": "blocks" (else 422 "not a block-editor field") and a vocabulary
// naming wikilink (else 422 "inline wikilink is not in this field's vocabulary"): out/04-first-try.txt.
import {bp, getDoc, show, DS, para, text, wikilink} from './lib.mjs'

const ops = (id, body) => bp('POST', `/v1/data/doc/${DS}/note/${id}/fields/body/ops`, body)
const state = async (label) => {
  const d = (await getDoc('note', 'n4', 'drafts')).body.result
  const p = (await getDoc('note', 'n4', 'published')).body.result
  console.log(`${label}: drafts-view _id=${d._id} blocks=${d.body.blocks.length} | published blocks=${p?.body?.blocks?.length}`)
  return d._rev
}

const rev0 = await state('n4 before')
const r1 = await ops('n4', {ifRev: rev0, ops: [
  {op: 'insert-after', afterId: 'n4-p1', block: para('n4-p2', text('Also daffodils, see '), wikilink('n3', 'groceries'), text('.'))},
]})
show('insert-after on n4', r1)
const rev1 = await state('n4 after insert')

show('patch-block with STALE ifRev (rev0)', await ops('n4', {ifRev: rev0, ops: [{op: 'patch-block', id: 'n4-p2', patch: {content: [text('stale writer')]}}]}))
show('patch-block with fresh rev, fence:blocks', await ops('n4', {ifRev: rev1, fence: 'blocks', ops: [{op: 'patch-block', id: 'n4-p1', patch: {content: [text('Plant tulips in late October.')]}}]}))
await state('n4 after patch')

// A body wikilink while the note is a draft vs. after publish.
show('backlinks n3 (body link from n4, draft)', await bp('GET', `/v1/data/backlinks/${DS}/n3`))
show('publish n4', await bp('POST', `/v1/data/mutate/${DS}`, {mutations: [{publish: {id: 'n4', type: 'note'}}]}))
show('backlinks n3 after publish', await bp('GET', `/v1/data/backlinks/${DS}/n3`))
