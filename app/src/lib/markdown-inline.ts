import type {Inline} from './model.ts'

export type Resolve = (title: string) => string | undefined

const PUNCT = /[!-/:-@[-`{-~]/
const KIND: Record<string, string> = {'**': 'strong', __: 'strong', '~~': 'strikethrough', '*': 'em', _: 'em'}
const DELIMS = ['**', '__', '~~', '*', '_']

const text = (value: string): Inline => ({type: 'text', value})
const isSpace = (c?: string) => !c || /\s/.test(c)
const isWord = (c?: string) => !!c && /[\p{L}\p{N}]/u.test(c)

const runAt = (s: string, i: number, c: string) => {
  let j = i
  while (s[j] === c) j++
  return j - i
}

function codeAt(s: string, i: number) {
  const n = runAt(s, i, '`')
  for (let j = s.indexOf('`', i + n); j !== -1; j = s.indexOf('`', j + runAt(s, j, '`'))) {
    if (runAt(s, j, '`') !== n) continue
    const raw = s.slice(i + n, j).replace(/\n/g, ' ')
    const value = raw.length > 1 && raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() ? raw.slice(1, -1) : raw
    return {value, next: j + n}
  }
  return null
}

const opens = (s: string, i: number, d: string) => !isSpace(s[i + d.length]) && (d[0] !== '_' || !isWord(s[i - 1]))
const closes = (s: string, j: number, d: string) => !isSpace(s[j - 1]) && (d[0] !== '_' || !isWord(s[j + d.length]))

function findClose(s: string, from: number, d: string): number {
  for (let j = from; j < s.length; ) {
    if (s[j] === '\\') {
      j += 2
      continue
    }
    if (s[j] === '`') {
      j = codeAt(s, j)?.next ?? j + runAt(s, j, '`')
      continue
    }
    if (s.startsWith(d, j)) {
      if (d === '*' && s[j + 1] === '*' && opens(s, j, '**')) {
        const k = findClose(s, j + 2, '**')
        if (k > 0) {
          j = k + 2
          continue
        }
      }
      if (j > from && closes(s, j, d)) return j
    } else if (d === '**' && s[j] === '*' && opens(s, j, '*')) {
      const k = findClose(s, j + 1, '*')
      if (k > 0) {
        j = k + 1
        continue
      }
    }
    j++
  }
  return -1
}

function wikiAt(s: string, i: number, resolve: Resolve) {
  const close = s.indexOf(']]', i + 2)
  const inner = close === -1 ? '' : s.slice(i + 2, close)
  if (!inner.trim() || /[\n[]/.test(inner)) return null
  const pipe = inner.indexOf('|')
  const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
  const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim()
  const docId = resolve(target)
  const node: Inline = {type: 'wikilink', target, ...(docId && {docId}), ...(alias && {alias}), children: [text(alias || target)]}
  return {node, next: close + 2}
}

function labelEnd(s: string, i: number) {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') j++
    else if (s[j] === '`') j = (codeAt(s, j)?.next ?? j + runAt(s, j, '`')) - 1
    else if (s[j] === '[') depth++
    else if (s[j] === ']' && --depth === 0) return j
  }
  return -1
}

function destAt(s: string, i: number) {
  if (s[i] === '<') {
    const k = s.indexOf('>', i)
    return k === -1 || s.slice(i, k).includes('\n') ? null : {href: s.slice(i + 1, k), next: k + 1}
  }
  let depth = 0
  let j = i
  for (; j < s.length && !isSpace(s[j]); j++) {
    if (s[j] === '(') depth++
    else if (s[j] === ')' && depth-- === 0) break
  }
  return {href: s.slice(i, j), next: j}
}

function linkAt(s: string, i: number, resolve: Resolve) {
  const end = labelEnd(s, i)
  if (end === -1 || s[end + 1] !== '(') return null
  const d = destAt(s, end + 2)
  if (!d?.href) return null
  const rest = /^(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/.exec(s.slice(d.next))
  if (!rest) return null
  const label = parseInline(s.slice(i + 1, end), resolve)
  const node = {type: 'link', href: d.href, children: label.length ? label : [text(d.href)]} as Inline
  return {node, next: d.next + rest[0].length}
}

export function parseInline(s: string, resolve: Resolve): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const push = (x: Inline, next: number) => {
    if (buf) out.push(text(buf))
    buf = ''
    out.push(x)
    i = next
  }
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && (s[i + 1] === '\n' || PUNCT.test(s[i + 1] ?? ''))) {
      buf += s[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const code = codeAt(s, i)
      if (code) push({type: 'code', value: code.value}, code.next)
      else (buf += '`'.repeat(runAt(s, i, '`'))), (i += runAt(s, i, '`'))
      continue
    }
    const wiki = s.startsWith('[[', i) && wikiAt(s, i, resolve)
    if (wiki) {
      push(wiki.node, wiki.next)
      continue
    }
    const link = (c === '[' || s.startsWith('![', i)) && linkAt(s, c === '!' ? i + 1 : i, resolve)
    if (link) {
      push(link.node, link.next)
      continue
    }
    const u = s.startsWith('<u>', i) ? s.indexOf('</u>', i + 3) : -1
    if (u > 0) {
      push({type: 'underline', children: parseInline(s.slice(i + 3, u), resolve)}, u + 4)
      continue
    }
    const auto = c === '<' && /^<([a-z][a-z0-9+.-]{1,31}:[^\s<>]*)>/i.exec(s.slice(i))
    if (auto) {
      push({type: 'link', href: auto[1], children: [text(auto[1])]} as Inline, i + auto[0].length)
      continue
    }
    const d = DELIMS.find((x) => s.startsWith(x, i))
    const k = d && opens(s, i, d) ? findClose(s, i + d.length, d) : -1
    if (d && k > 0) push({type: KIND[d], children: parseInline(s.slice(i + d.length, k), resolve)}, k + d.length)
    else (buf += d ?? c), (i += d?.length ?? 1)
  }
  if (buf) out.push(text(buf))
  return out
}
