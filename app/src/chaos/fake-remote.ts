import type {Manifest, Pushed, ServerDoc} from '../server/sync.ts'

export type Remote = {
  mutate: (mutations: unknown[]) => Promise<Pushed>
  docs: (type: string, ids: string[]) => Promise<ServerDoc[]>
  manifest: () => Promise<Manifest>
}

let current: Remote | undefined

export const answer = (r: Remote) => void (current = r)

const remote = () => {
  if (!current) throw new Error('chaos: no remote in use')
  return current
}

export const pushMutations = ({data}: {data: {mutations: unknown[]}}) => remote().mutate(data.mutations)

export const pullDocs = ({data}: {data: {type: string; ids: string[]}}) => remote().docs(data.type, data.ids)

export const pullManifest = () => remote().manifest()

export const pullCounts = async () => {
  const m = await remote().manifest()
  return {note: m.note.length, notebook: m.notebook.length}
}
