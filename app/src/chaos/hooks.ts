import {registerHooks} from 'node:module'

const fakes: Record<string, string> = {
  '/src/replica/db.ts': new URL('./fake-db.ts', import.meta.url).href,
  '/src/sync/remote.ts': new URL('./fake-remote.ts', import.meta.url).href,
}

const bare = (s: string) => (s.startsWith('.') || s.startsWith('/')) && !/\.[cm]?[jt]sx?$/.test(s)

registerHooks({
  resolve(specifier, context, next) {
    const found = next(bare(specifier) ? `${specifier}.ts` : specifier, context)
    const fake = Object.entries(fakes).find(([end]) => found.url.endsWith(end))
    return fake ? {...found, url: fake[1]} : found
  },
})

export function freeze(now: () => number) {
  const [Real, uuid] = [Date, crypto.randomUUID]
  let made = 0
  globalThis.Date = class extends Real {
    constructor(...a: unknown[]) {
      super(...((a.length ? a : [now()]) as [number]))
    }
    static now = now
  } as DateConstructor
  crypto.randomUUID = () => `00000000-0000-4000-8000-${(++made).toString(16).padStart(12, '0')}`
  return () => {
    globalThis.Date = Real
    crypto.randomUUID = uuid
  }
}
