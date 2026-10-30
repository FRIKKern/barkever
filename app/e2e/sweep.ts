import {cli} from './account.ts'
import {drop, dropEach, stale} from './drop.ts'
import {bp} from './seed.ts'

const yes = process.argv.includes('--yes')
const {server, token} = cli()
const res = await fetch(`${server}/api/workspaces/barkever/projects/default/datasets`, {headers: {authorization: `Bearer ${token}`}})
if (!res.ok) throw new Error(`listing datasets: Barkpark ${res.status}`)
const all = ((await res.json()) as {datasets: {slug: string}[]}).datasets.map((d) => d.slug)
const old = stale(all, Date.now())

console.log(`${all.length} datasets, ${old.length} leftover run datasets older than 2 hours${yes ? '' : ' (dry run; --yes deletes them)'}:`)
if (!yes) for (const name of old) console.log(`  ${name}`)
else if (!(await dropEach(old, (name) => drop(name, bp), console.log))) {
  console.log('stopped: the last dataset is not gone, so the rest wait for the next sweep')
  process.exitCode = 1
}
