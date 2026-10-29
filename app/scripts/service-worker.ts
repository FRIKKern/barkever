import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {transformWithOxc, type Plugin} from 'vite'
import type {Precache} from '../src/worker/sw.ts'

const SOURCE = fileURLToPath(new URL('../src/worker/sw.ts', import.meta.url))

export const buildStamp = () => process.env.BARKEVER_BUILD || Date.now().toString(36)

export function serviceWorker(build: string): Plugin {
  return {
    name: 'barkever:service-worker',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    async generateBundle(_, bundle) {
      const precache: Precache = {build, files: Object.keys(bundle).filter((f) => f.startsWith('assets/')).map((f) => `/${f}`).sort()}
      const {code} = await transformWithOxc(readFileSync(SOURCE, 'utf8'), SOURCE, {lang: 'ts'})
      this.emitFile({type: 'asset', fileName: 'sw.js', source: `const PRECACHE = ${JSON.stringify(precache)}\n${code}`})
    },
  }
}
