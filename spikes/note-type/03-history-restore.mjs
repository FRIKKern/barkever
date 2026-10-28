// Test 5: history + restore. (out/03 also holds a first try at body ops: 422 until the field says "editor": "blocks"; see 04.)
import {bp, getDoc, show, DS, para, text} from './lib.mjs'

const hist = await bp('GET', `/v1/data/history/${DS}/note/n1`)
show('history n1', hist)
const revs = hist.body.revisions ?? []
const oldest = revs.at(-1)
show('oldest revision', await bp('GET', `/v1/data/revision/${DS}/${oldest.id}`))

// Restore the oldest (title "Kickoff") → becomes a new draft.
show('restore oldest', await bp('POST', `/v1/data/revision/${DS}/${oldest.id}/restore`, {type: 'note'}))
const after = await getDoc('note', 'n1')
console.log('\nn1 draft title after restore:', JSON.stringify(after.body.result?.title), 'id', after.body.result?._id)
show('history n1 after restore', await bp('GET', `/v1/data/history/${DS}/note/n1?limit=3`))

