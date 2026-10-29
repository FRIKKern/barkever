import {createServerFn} from '@tanstack/react-start'
import {counts, docsById, manifest, mutate} from '../server/sync'

export const pushMutations = createServerFn({method: 'POST'})
  .validator((d: {mutations: unknown[]}) => d)
  .handler(({data}) => mutate(data.mutations))

export const pullDocs = createServerFn({method: 'POST'})
  .validator((d: {type: 'note' | 'notebook'; ids: string[]}) => d)
  .handler(({data}) => docsById(data.type, data.ids))

export const pullManifest = createServerFn({method: 'GET'}).handler(() => manifest())

export const pullCounts = createServerFn({method: 'GET'}).handler(() => counts())
