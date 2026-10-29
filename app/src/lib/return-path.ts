const HOME = '/'
const ORIGIN = 'http://barkever.invalid'

export function returnPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || /\s/.test(raw) || raw.length > 2048 || raw.startsWith('/sign-')) return HOME
  for (let s = raw, i = 0; ; i++) {
    if (i === 4 || /^\/\/|\\|[\u0000-\u001f\u007f-\u009f]/.test(s)) return HOME
    let next: string
    try {
      next = decodeURIComponent(s)
    } catch {
      return HOME
    }
    if (next === s) break
    s = next
  }
  return new URL(raw, ORIGIN).origin === ORIGIN ? raw : HOME
}
