import {newDevice, type Device} from './fake-db.ts'
import type {keeper} from '../sync/cursor.ts'
import type {Block} from '../lib/model.ts'
import type {Frame} from '../sync/stream.ts'

export type Job = 'push' | 'refetch' | 'catchup'
export type Call = {label: string; go: () => void; fail: () => void}
export type Writer = {
  id: string
  device: Device
  online: boolean
  connected: boolean
  catching: boolean
  session: number
  view: {title: string; blocks: Block[]; tags: string[]; notebook: string | null}
  inbox: {f: Frame; replay: boolean}[]
  cursor?: ReturnType<typeof keeper>
  jobs: Job[]
  running?: Promise<unknown>
  call?: Call
  retry?: number
  parked?: () => void
  typed: number
}

export const writer = (id: string): Writer => ({id, device: newDevice(id), online: true, connected: false, catching: false, session: 0, view: {title: '', blocks: [], tags: [], notebook: null}, inbox: [], jobs: [], typed: 0})
