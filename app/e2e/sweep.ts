import {cli} from './account.ts'
import {drop, throwaway} from './seed.ts'

const OLDER_THAN_MS = 2 * 3600_000
const yes = process.argv.includes('--yes')

const madeAt = (name: string) => {
  const [, y, mo, d, h, mi, s] = name.match(/-(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(?:-\d+)?$/)!.map(Number)
  return Date.UTC(y, mo - 1, d, h, mi, s)
}

const {server, token} = cli()
const res = await fetch(`${server}/api/workspaces/barkever/projects/default/datasets`, {headers: {authorization: `Bearer ${token}`}})
if (!res.ok) throw new Error(`listing datasets: Barkpark ${res.status}`)
const all = ((await res.json()) as {datasets: {slug: string}[]}).datasets.map((d) => d.slug)
const old = all.filter((n) => throwaway(n) && Date.now() - madeAt(n) > OLDER_THAN_MS).sort()

console.log(`${all.length} datasets, ${old.length} leftover run datasets older than 2 hours${yes ? '' : ' (dry run; --yes deletes them)'}:`)
for (const name of old) console.log(yes ? await drop(name) : `  ${name}`)
console.log(`left alone: ${all.filter((n) => !old.includes(n)).join(', ')}`)
