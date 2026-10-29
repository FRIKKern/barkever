import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {createServer} from 'node:net'

export const HOST = '127.0.0.1'

export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer().once('error', fail)
    s.listen(0, HOST, () => {
      const {port} = s.address() as {port: number}
      s.close(() => done(port))
    })
  })
}

export function savedPort(file: string): number | undefined {
  const port = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) : NaN
  return Number.isInteger(port) && port > 1024 && port < 65536 ? port : undefined
}

export async function installPort(file: string): Promise<number> {
  const kept = savedPort(file)
  if (kept) return kept
  const port = await freePort()
  writeFileSync(file, `${port}\n`)
  return port
}
