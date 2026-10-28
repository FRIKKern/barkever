// Tests 2 + 8: 2 notebooks, 5 notes, an ifRevisionID edit, a stale-rev conflict, required fields.
// PREFIX=r1- node 01-create-and-conflict.mjs   writes a fresh set beside the one 02–05 use.
import {mutate, getDoc, show, para, text, wikilink} from './lib.mjs'

const P = process.env.PREFIX ?? ''
const ref = (id) => ({_ref: P + id, _type: 'reference'})
const nb = (id, name) => ({_id: P + id, _type: 'notebook', name})
const note = (id, title, notebook, words, extra = []) => ({
  _id: P + id, _type: 'note', title, notebook: ref(notebook), tags: ['spike'],
  body: {blocks: [para(`${id}-p1`, text(words)), ...extra]},
})

show('create notebooks', await mutate([
  {createOrReplace: nb('nb-work', 'Work')},
  {createOrReplace: nb('nb-home', 'Home')},
]))
show('create 5 notes', await mutate([
  {createOrReplace: note('n1', 'Kickoff', 'nb-work', 'Kickoff with the aubergine team on Monday.')},
  {createOrReplace: note('n2', 'Budget', 'nb-work', 'Budget draft for Q4.',
    [para('n2-p2', text('See '), wikilink(P + 'n1', 'the kickoff note'), text('.'))])},
  {createOrReplace: note('n3', 'Groceries', 'nb-home', 'Milk, eggs, saffron.')},
  {createOrReplace: note('n4', 'Garden', 'nb-home', 'Plant tulips in October.')},
  {createOrReplace: note('n5', 'Ideas', 'nb-work', 'Quick capture should feel instant.')},
]))

// Where did they land: draft or published?
show('n1 published', await getDoc('note', P + 'n1', 'published'))
const dr = await getDoc('note', P + 'n1', 'drafts')
show('n1 drafts', dr)
const {_id: id, _rev: rev} = dr.body.result
console.log('\nn1 _id', id, '_rev', rev)

// Edit with the current rev, then again with the same (now stale) rev.
show('patch with current rev', await mutate([{patch: {id, type: 'note', set: {title: 'Kickoff (edited)'}, ifRevisionID: rev}}]))
show('patch with STALE rev', await mutate([{patch: {id, type: 'note', set: {title: 'Kickoff (stale writer)'}, ifRevisionID: rev}}]))
const after = await getDoc('note', P + 'n1')
console.log('\nn1 title after both writes:', JSON.stringify(after.body.result.title))

// Required fields: a note without a notebook, a notebook without a name.
show('create note without notebook (required)', await mutate([{create: {_id: P + 'n-noref', _type: 'note', title: 'No notebook'}}]))
show('publish note without notebook', await mutate([{publish: {id: P + 'n-noref', type: 'note'}}]))
show('create notebook without name (required)', await mutate([{create: {_id: P + 'nb-noname', _type: 'notebook'}}]))
