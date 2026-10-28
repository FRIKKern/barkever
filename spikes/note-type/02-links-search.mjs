// Tests 3 + 4 + drafts-vs-published: backlinks (body wikilink and a reference field), search.
import {bp, mutate, show, DS} from './lib.mjs'

// n3 → n4 through the `links` reference field (drafts.n3 exists from 01).
show('n3.links → n4 (field ref)', await mutate([{patch: {id: 'drafts.n3', type: 'note', set: {links: [{_ref: 'n4', _type: 'reference', _key: 'l1'}]}}}]))

const back = async (label) => {
  for (const id of ['n1', 'n4', 'nb-work']) show(`${label}: backlinks ${id}`, await bp('GET', `/v1/data/backlinks/${DS}/${id}`))
  show(`${label}: backlink-counts`, await bp('GET', `/v1/data/backlink-counts/${DS}?ids=n1,n4,nb-work`))
}
await back('drafts only')

// Search for a word that only lives in a note body.
const search = async (label, q, extra = '') => show(`${label}: search "${q}"`, await bp('GET', `/v1/data/search/${DS}?q=${encodeURIComponent(q)}&types=note${extra}`))
await search('drafts only', 'aubergine')
await search('drafts only', 'saffron', '&perspective=drafts')
await search('drafts only', 'kickoff note')   // wikilink label text

// Publish everything, then ask again.
const ids = ['nb-work', 'nb-home'].map((id) => ({publish: {id, type: 'notebook'}}))
  .concat(['n1', 'n2', 'n3', 'n4', 'n5'].map((id) => ({publish: {id, type: 'note'}})))
show('publish all', await mutate(ids))
await back('published')
await search('published', 'aubergine')
await search('published', 'saffron')
