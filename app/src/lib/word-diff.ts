export type Piece = {kind: 'same' | 'del' | 'ins'; text: string}

const words = (s: string) => s.split(/\s+/).filter(Boolean)

export function wordDiff(before: string, after: string): Piece[] {
  const a = words(before)
  const b = words(after)
  const lcs = Array.from({length: a.length + 1}, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: Piece[] = []
  const push = (kind: Piece['kind'], text: string) => {
    const last = out.at(-1)
    if (last?.kind === kind) last.text += ` ${text}`
    else out.push({kind, text})
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) push('same', (i++, j++, a[i - 1]))
    else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) push('del', a[i++])
    else push('ins', b[j++])
  }
  return out
}
