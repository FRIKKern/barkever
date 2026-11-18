import type {Inline} from './model.ts'

export type Resolve = (title: string) => string | undefined

const PUNCT = /[!-/:-@[-`{-~]/
const PLAIN = /[^\\`[!<*_~]+/y
const AUTOLINK = /<([a-z][a-z0-9+.-]{1,31}:[^\s<>]*)>/iy
const TITLE_END = /(?:\s+(?:"[^"\n]{0,512}"|'[^'\n]{0,512}'))?\s*\)/y
const MAX_DEST = 2048
const MAX_DEPTH = 16
const MAX_PARENS = 8

export const unsafeHref = (href: string) => /^\s*(javascript|vbscript|data):/i.test(href)

const text = (value: string): Inline => ({type: 'text', value})
const isSpace = (c?: string) => !c || /\s/.test(c)
const isPunct = (c?: string) => !!c && /[\p{P}\p{S}]/u.test(c)

type Cell = {node: Inline | null; raw: string; prev: Cell | null; next: Cell | null; delim?: Delim}
type Delim = {ch: string; n: number; open: boolean; close: boolean; cell: Cell; below: Delim | null; above: Delim | null}

const runAt = (s: string, i: number, c: string) => {
  let j = i
  while (s[j] === c) j++
  return j - i
}

function flatten(from: Cell | null, until: Cell | null): Inline[] {
  const out: Inline[] = []
  for (let c = from; c && c !== until; c = c.next) {
    const last = out[out.length - 1]
    const words = c.node ? (c.node.type === 'text' ? (c.node.value ?? '') : null) : c.raw
    if (words === null) out.push(c.node!)
    else if (!words) continue
    else if (last?.type === 'text') last.value += words
    else out.push(text(words))
  }
  return out
}

function unstack(d: Delim) {
  if (d.below) d.below.above = d.above
  if (d.above) d.above.below = d.below
}

function unlink(c: Cell) {
  c.prev!.next = c.next
  if (c.next) c.next.prev = c.prev
}

function canMatch(o: Delim, c: Delim) {
  return o.ch === c.ch && o.open && (o.ch !== '~' || (o.n >= 2 && c.n >= 2))
}

function emphasis(first: Delim | null) {
  const bottom = new Map<string, Delim | null>()
  let closer = first
  while (closer) {
    if (!closer.close) {
      closer = closer.above
      continue
    }
    const stop = bottom.has(closer.ch) ? bottom.get(closer.ch) : undefined
    let o = closer.below
    while (o && o !== stop && !canMatch(o, closer)) o = o.below
    if (!o || o === stop) {
      bottom.set(closer.ch, closer.below)
      const next: Delim | null = closer.above
      if (!closer.open) unstack(closer)
      closer = next
      continue
    }
    const use = closer.ch === '~' || (o.n >= 2 && closer.n >= 2) ? 2 : 1
    const type = closer.ch === '~' ? 'strikethrough' : use === 2 ? 'strong' : 'em'
    const wrapped: Cell = {node: {type, children: flatten(o.cell.next, closer.cell)}, raw: '', prev: o.cell, next: closer.cell}
    o.cell.next = wrapped
    closer.cell.prev = wrapped
    o.above = closer
    closer.below = o
    o.n -= use
    closer.n -= use
    o.cell.raw = o.ch.repeat(o.n)
    closer.cell.raw = closer.ch.repeat(closer.n)
    if (!o.n) (unstack(o), unlink(o.cell))
    if (!closer.n) {
      const next: Delim | null = closer.above
      unstack(closer)
      unlink(closer.cell)
      closer = next
    }
  }
}

export function parseInline(s: string, resolve: Resolve, depth = 0): Inline[] {
  const failedCode = new Set<number>()
  let noUnderline = false

  function codeAt(i: number) {
    const n = runAt(s, i, '`')
    if (failedCode.has(n)) return null
    for (let j = s.indexOf('`', i + n); j !== -1; j = s.indexOf('`', j + runAt(s, j, '`'))) {
      if (runAt(s, j, '`') !== n) continue
      const raw = s.slice(i + n, j).replace(/\n/g, ' ')
      const value = raw.length > 1 && raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() ? raw.slice(1, -1) : raw
      return {value, next: j + n}
    }
    failedCode.add(n)
    return null
  }

  const closes = new Map<number, number>()
  const openings: number[] = []
  for (let j = 0; j < s.length; ) {
    if (s[j] === '\\') j += 2
    else if (s[j] === '`') j = codeAt(j)?.next ?? j + runAt(s, j, '`')
    else {
      if (s[j] === '[') openings.push(j)
      else if (s[j] === ']' && openings.length) closes.set(openings.pop()!, j)
      j++
    }
  }

  function wikiAt(i: number) {
    let j = i + 2
    while (j < s.length && !s.startsWith(']]', j) && s[j] !== '[' && s[j] !== '\n') j++
    if (!s.startsWith(']]', j)) return null
    const inner = s.slice(i + 2, j)
    const pipe = inner.indexOf('|')
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
    if (!target) return null
    const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim()
    const docId = resolve(target)
    return {node: {type: 'wikilink', target, ...(docId && {docId}), ...(alias && {alias}), children: [text(alias || target)]} as Inline, next: j + 2}
  }

  function destAt(i: number) {
    const limit = Math.min(s.length, i + MAX_DEST)
    if (s[i] === '<') {
      let k = i + 1
      while (k < limit && s[k] !== '>' && s[k] !== '\n') k++
      return s[k] === '>' ? {href: s.slice(i + 1, k), next: k + 1} : null
    }
    let level = 0
    let j = i
    for (; j < limit; j++) {
      const c = s.charCodeAt(j)
      if (c <= 32 || (c === 41 && level-- === 0)) break
      if (c === 40 && ++level > MAX_PARENS) return null
    }
    return j < limit || j === s.length ? {href: s.slice(i, j), next: j} : null
  }

  function linkAt(i: number) {
    const end = closes.get(i)
    if (end === undefined || s[end + 1] !== '(' || depth >= MAX_DEPTH) return null
    const d = destAt(end + 2)
    if (!d?.href) return null
    TITLE_END.lastIndex = d.next
    if (!TITLE_END.test(s)) return null
    return {href: d.href, label: parseInline(s.slice(i + 1, end), resolve, depth + 1), next: TITLE_END.lastIndex}
  }

  const head: Cell = {node: null, raw: '', prev: null, next: null}
  let tail = head
  let first: Delim | null = null
  let top: Delim | null = null
  let buf = ''
  const append = (cell: Cell) => {
    cell.prev = tail
    tail.next = cell
    tail = cell
  }
  const flush = () => {
    if (buf) append({node: null, raw: buf, prev: null, next: null})
    buf = ''
  }
  const atoms = (nodes: Inline[]) => {
    flush()
    for (const node of nodes) append({node, raw: '', prev: null, next: null})
  }

  let i = 0
  while (i < s.length) {
    PLAIN.lastIndex = i
    if (PLAIN.test(s)) {
      buf += s.slice(i, PLAIN.lastIndex)
      i = PLAIN.lastIndex
      continue
    }
    const c = s[i]
    if (c === '\\') {
      const escaped = s[i + 1] === '\n' || PUNCT.test(s[i + 1] ?? '')
      buf += escaped ? s[i + 1] : c
      i += escaped ? 2 : 1
      continue
    }
    if (c === '`') {
      const code = codeAt(i)
      const n = runAt(s, i, '`')
      if (code) (atoms([{type: 'code', value: code.value}]), (i = code.next))
      else (buf += '`'.repeat(n)), (i += n)
      continue
    }
    const wiki = s.startsWith('[[', i) ? wikiAt(i) : null
    if (wiki) {
      atoms([wiki.node])
      i = wiki.next
      continue
    }
    const link = c === '[' ? linkAt(i) : c === '!' && s[i + 1] === '[' ? linkAt(i + 1) : null
    if (link) {
      const label = link.label.length ? link.label : [text(link.href)]
      atoms(unsafeHref(link.href) ? label : [{type: 'link', href: link.href, children: label} as Inline])
      i = link.next
      continue
    }
    if (c === '<' && s.startsWith('<u>', i) && !noUnderline && depth < MAX_DEPTH) {
      const k = s.indexOf('</u>', i + 3)
      if (k !== -1) {
        atoms([{type: 'underline', children: parseInline(s.slice(i + 3, k), resolve, depth + 1)}])
        i = k + 4
        continue
      }
      noUnderline = true
    }
    AUTOLINK.lastIndex = i
    const auto = c === '<' ? AUTOLINK.exec(s) : null
    if (auto) {
      atoms([unsafeHref(auto[1]) ? text(auto[1]) : ({type: 'link', href: auto[1], children: [text(auto[1])]} as Inline)])
      i = AUTOLINK.lastIndex
      continue
    }
    const n = c === '*' || c === '_' || c === '~' ? runAt(s, i, c) : 0
    if (!n || (c === '~' && n < 2)) {
      buf += n ? c.repeat(n) : c
      i += n || 1
      continue
    }
    const before = s[i - 1]
    const after = s[i + n]
    const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before))
    const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after))
    flush()
    const cell: Cell = {node: null, raw: c.repeat(n), prev: null, next: null}
    append(cell)
    const d: Delim = {ch: c, n, cell, below: top, above: null, open: c === '_' ? left && (!right || isPunct(before)) : left, close: c === '_' ? right && (!left || isPunct(after)) : right}
    cell.delim = d
    if (top) top.above = d
    top = d
    first ??= d
    i += n
  }
  flush()
  emphasis(first)
  return flatten(head.next, null)
}
