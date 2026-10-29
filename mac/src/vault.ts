import {randomBytes} from 'node:crypto'
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs'

export type Box = {encryptString(plain: string): Buffer; decryptString(sealed: Buffer): string}
type Contents = {secret: string; session?: string}

const fresh = (): Contents => ({secret: randomBytes(32).toString('base64url')})

function read(file: string, box: Box): Contents | undefined {
  if (!existsSync(file)) return undefined
  try {
    const v = JSON.parse(box.decryptString(readFileSync(file))) as Contents
    return typeof v.secret === 'string' && v.secret.length >= 32 ? v : undefined
  } catch {
    return undefined
  }
}

export function openVault(file: string, box: Box) {
  const found = read(file, box)
  let v = found ?? fresh()
  const save = () => {
    writeFileSync(`${file}.next`, box.encryptString(JSON.stringify(v)), {mode: 0o600})
    renameSync(`${file}.next`, file)
  }
  if (!found) save()
  return {
    secret: v.secret,
    session: () => v.session,
    keep(session: string | null) {
      if ((v.session ?? null) === session) return
      v = session ? {...v, session} : {secret: v.secret}
      save()
    },
  }
}

export type Vault = ReturnType<typeof openVault>
