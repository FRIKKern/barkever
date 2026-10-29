import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'

export const DATASET = 'fixtures'

export async function deleteNotes(ids: string[]): Promise<void> {
  if (!ids.length) return
  const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8')) as {server: string; token: string}
  const res = await fetch(`${cfg.server}/w/barkever/p/default/v1/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: {authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json'},
    body: JSON.stringify({mutations: ids.map((id) => ({delete: {id, type: 'note'}}))}),
  })
  if (!res.ok) throw new Error(`cleanup failed: Barkpark ${res.status}`)
}
