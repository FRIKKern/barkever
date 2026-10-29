export const COOKIE = 'bk_session'

export type Kept = {header: string; session: string | null}

const lifetime = /^(max-age|expires)=/i

function ended(attrs: string[], now: number): boolean {
  return attrs.some((a) => /^max-age=\s*(0|-)/i.test(a) || (/^expires=/i.test(a) && Date.parse(a.slice(8)) <= now))
}

export function memoryOnly(setCookie: string, now = Date.now()): Kept | undefined {
  const [pair = '', ...attrs] = setCookie.split(';').map((s) => s.trim())
  if (!pair.startsWith(`${COOKIE}=`)) return undefined
  const value = pair.slice(COOKIE.length + 1)
  if (!value || ended(attrs, now)) return {header: setCookie, session: null}
  return {header: [pair, ...attrs.filter((a) => !lifetime.test(a))].join('; '), session: value}
}
