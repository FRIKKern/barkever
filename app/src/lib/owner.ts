import {createServerFn} from '@tanstack/react-start'
import {dataset} from '../server/barkpark'
import {nameReplica, replicaName} from '../replica/db'
import {keepPage} from './offline'

const fetchDataset = createServerFn({method: 'GET'}).handler(() => dataset())

const KEY = 'barkever-owner'
type Owner = {email: string | null; replica: string}

function lastOwner(): Owner | undefined {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

export async function openReplica(email: string | null) {
  const ds = await fetchDataset().catch(() => undefined)
  if (!ds) {
    const last = lastOwner()
    if (last?.email === email) nameReplica(last.replica)
    return
  }
  const replica = await replicaName(email, ds)
  localStorage.setItem(KEY, JSON.stringify({email, replica} satisfies Owner))
  nameReplica(replica)
  void keepPage()
}

export async function forgetOwner() {
  localStorage.removeItem(KEY)
  for (const key of (await globalThis.caches?.keys()) ?? []) if (key.startsWith('barkever-')) await (await caches.open(key)).delete('/')
}
