export type Needle = {name: string; value: string}

const SHORTEST_SECRET = 16
const TOKEN_SHAPE = /bp[a-z]{1,6}_[A-Za-z0-9_-]{43}/

export const secretNeedles = (names: string[], env: Record<string, string | undefined>): Needle[] =>
  names.flatMap((name) => {
    const value = env[name]
    return value && value.length >= SHORTEST_SECRET ? [{name, value}] : []
  })

export const exactLeaks = (needles: Needle[], where: string, text: string) => needles.filter((n) => text.includes(n.value)).map((n) => `${where}: ${n.name}`)

const without = (text: string, known: string[]) => known.filter(Boolean).reduce((t, k) => t.replaceAll(k, ' '), text)

export const leaks = (needles: Needle[], where: string, text: string, known: string[] = []) => [
  ...exactLeaks(needles, where, text),
  ...(TOKEN_SHAPE.test(without(text, known)) ? [`${where}: a bp token shape`] : []),
]
