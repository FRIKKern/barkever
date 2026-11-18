import type {Block, Item} from './model.ts'
import {parseInline, type Resolve} from './markdown-inline.ts'

export type Read = {fallback: string; id: () => string; resolve: Resolve}
export type Parsed = {title: string; tags: string[]; blocks: Block[]}

export const MAX_FILE_BYTES = 256 * 1024
export const MARKDOWN = /\.(md|markdown|txt)$/i

export function sortFiles<F extends {name: string; size: number}>(files: F[]) {
  const take: F[] = []
  const skip: {name: string; why: string}[] = []
  for (const f of files) {
    if (!MARKDOWN.test(f.name)) skip.push({name: f.name, why: 'not Markdown'})
    else if (f.size > MAX_FILE_BYTES) skip.push({name: f.name, why: `over ${MAX_FILE_BYTES / 1024} KB`})
    else take.push(f)
  }
  return {take, skip}
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}> ?/
const IMAGE = /^ {0,3}!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)[ \t]*$/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const ITEM = /^( *)([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/
const TASK = /^\[([ xX])\](?:[ \t]+|$)(.*)$/

const indentOf = (l: string) => l.length - l.trimStart().length
const blank = (l: string) => !l.trim()

type Mark = {indent: number; col: number; ordered: boolean; start: number; task: boolean; checked: boolean; rest: string}

function itemOf(line: string): Mark | null {
  const m = ITEM.exec(line)
  if (!m || RULE.test(line)) return null
  const [, lead, marker, gap, body] = m
  const ordered = /\d/.test(marker)
  const task = !ordered ? TASK.exec(body) : null
  const col = lead.length + marker.length + (gap.length > 4 || !body ? 1 : gap.length)
  return {indent: lead.length, col, ordered, start: ordered ? parseInt(marker, 10) : 1, task: !!task, checked: !!task && task[1] !== ' ', rest: task ? task[2] : body}
}

const opensBlock = (l: string) => FENCE.test(l) || HEADING.test(l) || RULE.test(l) || QUOTE.test(l)

function joinLines(lines: string[]) {
  return lines
    .map((l, i) => {
      const t = l.trim()
      if (i === lines.length - 1) return t
      if (t.endsWith('\\') && !t.endsWith('\\\\')) return `${t.slice(0, -1)}\n`
      return /\S {2,}$/.test(l) ? `${t}\n` : `${t} `
    })
    .join('')
}

type Ctx = Read

const prose = (type: string, lines: string[], ctx: Ctx, extra: Partial<Block> = {}): Block => ({id: ctx.id(), type, ...extra, content: parseInline(joinLines(lines), ctx.resolve)})

function fenced(lines: string[], i: number, ctx: Ctx) {
  const [, mark, lang] = FENCE.exec(lines[i])!
  const pad = indentOf(lines[i])
  const body: string[] = []
  let j = i + 1
  for (; j < lines.length; j++) {
    const close = FENCE.exec(lines[j])
    if (close && close[1][0] === mark[0] && close[1].length >= mark.length && !lines[j].trim().slice(close[1].length).trim()) break
    body.push(lines[j].slice(Math.min(pad, indentOf(lines[j]))))
  }
  return {block: {id: ctx.id(), type: 'code', ...(lang && {lang}), value: body.join('\n')} as Block, next: j + 1}
}

function quoted(lines: string[], i: number, ctx: Ctx) {
  const inside: string[] = []
  let j = i
  for (; j < lines.length && QUOTE.test(lines[j]); j++) inside.push(lines[j].replace(QUOTE, ''))
  const paras = inside.join('\n').split(/\n[ \t]*\n/).map((p) => p.split('\n')).filter((p) => p.some((l) => !blank(l)))
  return {blocks: paras.map((p) => prose('pullquote', p, ctx)), next: j}
}

function belongs(l: string, m: Mark) {
  return indentOf(l) >= m.col || (indentOf(l) > m.indent && !!itemOf(l))
}

function item(lines: string[], i: number, m: Mark, ctx: Ctx) {
  const body = [m.rest]
  let j = i + 1
  while (j < lines.length) {
    const l = lines[j]
    if (blank(l)) {
      let k = j
      while (k < lines.length && blank(lines[k])) k++
      if (k < lines.length && indentOf(lines[k]) >= m.col) {
        body.push(...lines.slice(j, k).map(() => ''))
        j = k
        continue
      }
      break
    }
    if (belongs(l, m)) body.push(l.slice(Math.min(indentOf(l), m.col)))
    else if (itemOf(l) || opensBlock(l)) break
    else body.push(l.trim())
    j++
  }
  let head = 0
  while (head < body.length && !blank(body[head]) && (head === 0 || (!itemOf(body[head]) && !opensBlock(body[head])))) head++
  const children = blocks(body.slice(head), ctx)
  const it: Item = {content: parseInline(joinLines(body.slice(0, head)), ctx.resolve), ...(m.task && {checked: m.checked}), ...(children.length && {children})}
  return {it, next: j}
}

function list(lines: string[], i: number, first: Mark, ctx: Ctx) {
  const items: Item[] = []
  let j = i
  while (j < lines.length) {
    const m = itemOf(lines[j])
    if (!m || m.ordered !== first.ordered || m.task !== first.task || m.indent >= first.col) break
    const {it, next} = item(lines, j, m, ctx)
    items.push(it)
    j = next
    let k = j
    while (k < lines.length && blank(lines[k])) k++
    const after = k < lines.length ? itemOf(lines[k]) : null
    if (after && after.ordered === first.ordered && after.task === first.task && after.indent < first.col) j = k
  }
  const block: Block = {id: ctx.id(), type: 'list', ordered: first.ordered, ...(first.task && {task: true}), ...(first.ordered && first.start !== 1 && {start: first.start}), items}
  return {block, next: j}
}

function paragraph(lines: string[], i: number, ctx: Ctx) {
  if (lines[i].trimStart().startsWith('|')) return {blocks: [prose('paragraph', [lines[i]], ctx)], next: i + 1}
  const run = [lines[i]]
  let j = i + 1
  for (; j < lines.length; j++) {
    const l = lines[j]
    const setext = SETEXT.exec(l)
    if (setext) return {blocks: [prose('heading', run, ctx, {level: setext[1][0] === '=' ? 1 : 2})], next: j + 1}
    const m = itemOf(l)
    if (blank(l) || opensBlock(l) || l.trimStart().startsWith('|') || (m && (!m.ordered || m.start === 1) && m.rest.trim())) break
    run.push(l)
  }
  return {blocks: [prose('paragraph', run, ctx)], next: j}
}

function blocks(lines: string[], ctx: Ctx): Block[] {
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (blank(l)) {
      i++
      continue
    }
    const heading = HEADING.exec(l)
    const image = IMAGE.exec(l)
    const m = itemOf(l)
    let step: {blocks: Block[]; next: number}
    if (FENCE.test(l)) step = one(fenced(lines, i, ctx))
    else if (heading) step = {blocks: [prose('heading', [heading[2] ?? ''], ctx, {level: Math.min(3, heading[1].length)})], next: i + 1}
    else if (RULE.test(l)) step = {blocks: [{id: ctx.id(), type: 'divider'}], next: i + 1}
    else if (QUOTE.test(l)) step = quoted(lines, i, ctx)
    else if (m) step = one(list(lines, i, m, ctx))
    else if (image) step = {blocks: [{id: ctx.id(), type: 'image', src: image[2], ...(image[1] && {alt: image[1]})} as Block], next: i + 1}
    else step = paragraph(lines, i, ctx)
    out.push(...step.blocks)
    i = step.next
  }
  return out
}

const one = ({block, next}: {block: Block; next: number}) => ({blocks: [block], next})

const unquote = (v: string) => {
  const t = v.trim()
  if (/^".*"$/.test(t)) {
    try {
      return String(JSON.parse(t))
    } catch {
      return t.slice(1, -1)
    }
  }
  return /^'.*'$/.test(t) ? t.slice(1, -1) : t
}

const tagWords = (v: string) =>
  v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => unquote(t).replace(/^#/, ''))
    .filter(Boolean)

function frontTags(front: string): string[] {
  const rows = front.split('\n')
  const at = rows.findIndex((r) => /^tags\s*:/i.test(r))
  if (at === -1) return []
  const inline = rows[at].replace(/^tags\s*:/i, '').trim()
  if (inline) return tagWords(inline)
  const out: string[] = []
  for (const r of rows.slice(at + 1)) {
    const m = /^\s*-\s+(.*)$/.exec(r)
    if (!m) break
    out.push(...tagWords(m[1]))
  }
  return out
}

export function fromMarkdown(source: string, ctx: Read): Parsed {
  let text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const front = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text)
  const tags = front ? [...new Set(frontTags(front[1]))] : []
  if (front) text = text.slice(front[0].length)
  const lines = text.split('\n').map((l) => l.replace(/^[ \t]+/, (w) => w.replace(/\t/g, '    ')))
  let i = 0
  while (i < lines.length && blank(lines[i])) i++
  const titled = /^#(?:[ \t]+(.*))?$/.exec(lines[i] ?? '')
  const title = titled ? (titled[1] ?? '').trim() : ctx.fallback
  return {title, tags, blocks: blocks(lines.slice(titled ? i + 1 : i), ctx)}
}
