import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8'))
export const bp = (path, init = {}) => fetch(`${cfg.server}/w/barkever/p/default${path}`, {...init, headers: {authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json'}})
export async function all(ds, type) {
  const docs = []
  for (let more = true; more; ) {
    const r = await bp(`/v1/data/query/${ds}/${type}?perspective=drafts&order=_id:asc&limit=1000&offset=${docs.length}`)
    if (!r.ok) throw new Error(`query ${r.status}`)
    const p = await r.json(); docs.push(...p.result.documents); more = p.result.hasMore && p.result.documents.length > 0
  }
  return docs
}
