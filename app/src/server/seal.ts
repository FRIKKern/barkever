import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto'

const VERSION = 'v1'
const key = (secret: string) => createHash('sha256').update(`barkever session ${VERSION}\0${secret}`).digest()

export function seal(data: object, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return [VERSION, ...[iv, body, cipher.getAuthTag()].map((b) => b.toString('base64url'))].join('.')
}

export function unseal<T>(sealed: string, secret: string): T | undefined {
  const [version, iv, body, tag] = sealed.split('.')
  if (version !== VERSION || !iv || !body || !tag) return undefined
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'), {authTagLength: 16})
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')) as T
  } catch {
    return undefined
  }
}
