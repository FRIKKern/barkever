import {fileURLToPath} from 'node:url'
import {staleDist} from './stale-dist.ts'

export default function setup() {
  const stale = staleDist(fileURLToPath(new URL('../../app', import.meta.url)))
  if (stale) throw new Error(stale)
}
