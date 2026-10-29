import {casOn, knownRevs, settle} from '../replica/settle'
import {notify} from '../replica/bus'
import {bare, fromServer, type DocType} from '../replica/note'
import {pullCounts, pullDocs, pullManifest} from './remote'

const TYPES: DocType[] = ['notebook', 'note']

const synced = (known: Map<string, string | undefined>) => [...known.values()].filter((rev) => rev !== undefined).length

async function settleFresh(type: DocType, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const known = await knownRevs(type)
  const docs = new Map((await pullDocs({data: {type, ids}})).map((d) => [bare(d._id), fromServer(d)]))
  const applied: string[] = []
  for (const id of ids) if ((await settle(type, id, docs.get(id) ?? null, casOn(known.get(id)), false)) === 'apply') applied.push(id)
  return applied
}

export async function refetch(wanted: Map<string, DocType>): Promise<void> {
  const applied: string[] = []
  for (const type of TYPES) applied.push(...(await settleFresh(type, [...wanted].filter(([, t]) => t === type).map(([id]) => id))))
  if (applied.length) notify({kind: 'remote', ids: applied})
}

export async function check({onlyIfCountsDiffer = false} = {}): Promise<void> {
  if (onlyIfCountsDiffer) {
    const counts = await pullCounts()
    const local = await Promise.all(TYPES.map(async (t) => synced(await knownRevs(t)) === counts[t]))
    if (local.every(Boolean)) return
  }
  const manifest = await pullManifest()
  const wanted = new Map<string, DocType>()
  for (const type of TYPES) {
    const known = await knownRevs(type)
    const server = new Map(manifest[type].map((x) => [x.id, x.rev]))
    for (const [id, rev] of server) if (known.get(id) !== rev) wanted.set(id, type)
    for (const [id, rev] of known) if (rev !== undefined && !server.has(id)) wanted.set(id, type)
  }
  await refetch(wanted)
}
