export type Needle = {name: string; value: string}

const SHORTEST_SECRET = 16
const SECRET_NAME = /\b[A-Z][A-Z0-9_]*_(?:TOKEN|SECRET|KEY|PASSWORD)\b/g
const TOKEN_SHAPE = /bp[a-z]{1,6}_[A-Za-z0-9_-]{43}/

export const secretNames = (sources: string[]) => [...new Set(sources.flatMap((s) => [...s.matchAll(SECRET_NAME)].map(([name]) => name)))].sort()

export function secretNeedles(names: string[], env: Record<string, string | undefined>) {
  const set = names.flatMap((name) => (env[name] ? [{name, value: env[name]}] : []))
  return {needles: set.filter(({value}) => value.length >= SHORTEST_SECRET), short: set.filter(({value}) => value.length < SHORTEST_SECRET).map(({name}) => name)}
}

export const exactLeaks = (needles: Needle[], where: string, text: string) => needles.filter((n) => text.includes(n.value)).map((n) => `${where}: ${n.name}`)

const without = (text: string, known: string[]) => known.filter((k) => k.length >= SHORTEST_SECRET).reduce((t, k) => t.replaceAll(k, ' '), text)

export const leaks = (needles: Needle[], where: string, text: string, known: string[] = []) => [
  ...exactLeaks(needles, where, text),
  ...(TOKEN_SHAPE.test(without(text, known)) ? [`${where}: a bp token shape`] : []),
]
