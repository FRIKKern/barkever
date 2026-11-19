import {blockText, childrenOf, codeOf, contentOf, inlineText, itemContent, itemsOf, leafText, linkWords, nestedOf, type Block, type Inline, type Item, type Note, type Title} from './model.ts'

const MARKS: Record<string, [string, string]> = {strong: ['**', '**'], em: ['*', '*'], strikethrough: ['~~', '~~'], underline: ['<u>', '</u>']}

const escape = (s: string) => s.replace(/[\\`*_[\]<>~]/g, '\\$&').replace(/\n/g, '\\\n')

const LINE_START = /^(#{1,6}(?=\s|$)|[-+>=](?=\s|$)|-{3,}|>)/

const guardStart = (s: string) => (LINE_START.test(s) ? `\\${s}` : s.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2'))

function wrap(inner: string, [open, close]: [string, string]) {
  const core = inner.trim()
  if (!core) return inner
  const lead = inner.slice(0, inner.length - inner.trimStart().length)
  const trail = inner.slice(inner.trimEnd().length)
  return `${lead}${open}${core}${close}${trail}`
}

function codeSpan(s: string) {
  const longest = Math.max(0, ...(s.match(/`+/g) ?? []).map((r) => r.length))
  const ticks = '`'.repeat(longest + 1)
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : ''
  return `${ticks}${pad}${s}${pad}${ticks}`
}

const dest = (href: string) => href.replace(/[\s()<>]/g, encodeURIComponent)

function wikilink(x: Inline, title: Title) {
  const words = linkWords(x, title)
  const target = title(x.docId) ?? x.target ?? words
  return words && words !== target ? `[[${target}|${words}]]` : `[[${target}]]`
}

function one(x: Inline, title: Title): string {
  if (x.type === 'wikilink') return wikilink(x, title)
  if (x.type === 'code') return codeSpan(leafText(x) ?? inlineText(childrenOf(x)))
  const own = leafText(x)
  const words = own ? escape(own) : inlines(childrenOf(x), title)
  if (x.type === 'link') {
    const href = (x as {href?: unknown}).href
    return typeof href === 'string' && href ? `[${words || escape(href)}](${dest(href)})` : words
  }
  const mark = MARKS[x.type]
  return mark ? wrap(words, mark) : words
}

const inlines = (c: Inline[], title: Title) => c.map((x) => one(x, title)).join('')

const prose = (c: Inline[], title: Title) => guardStart(inlines(c, title))

function fence(b: Block) {
  const body = codeOf(b)
  const ticks = '`'.repeat(Math.max(3, ...(body.match(/`{3,}/g) ?? []).map((r) => r.length + 1)))
  return [`${ticks}${typeof b.lang === 'string' ? b.lang : ''}`, ...body.split('\n'), ticks]
}

const checked = (it: Item) => typeof it === 'object' && !Array.isArray(it) && it.checked === true

function list(b: Block, title: Title): string[] {
  const start = Number.isInteger(b.start) ? b.start! : 1
  return itemsOf(b).flatMap((it, i) => {
    const marker = b.ordered ? `${start + i}. ` : b.task ? `- [${checked(it) ? 'x' : ' '}] ` : '- '
    const pad = ' '.repeat(b.ordered ? marker.length : 2)
    const [first, ...rest] = prose(itemContent(it), title).split('\n')
    const kids = nestedOf(it).flatMap((c) => lines(c, title))
    return [marker + first, ...[...rest, ...kids].map((l) => (l ? pad + l : l))]
  })
}

const asLines = (s: string) => (s.trim() ? s.split('\n') : [])

function lines(b: Block, title: Title): string[] {
  if (b.type === 'heading') {
    const words = prose(contentOf(b), title).replace(/\\?\n/g, ' ').replace(/([^\\])#$/, '$1\\#')
    return words.trim() ? [`${'#'.repeat(Math.min(6, Math.max(1, Number(b.level) || 1)))} ${words}`] : []
  }
  if (b.type === 'list') return list(b, title)
  if (b.type === 'code') return fence(b)
  if (b.type === 'blockquote' || b.type === 'pullquote') return asLines(prose(contentOf(b), title)).map((l) => `> ${l}`)
  if (b.type === 'divider') return ['---']
  if (b.type === 'image') {
    const {src, alt} = b as {src?: unknown; alt?: unknown}
    return typeof src === 'string' && src ? [`![${escape(typeof alt === 'string' ? alt : '')}](${dest(src)})`] : []
  }
  if (b.type === 'paragraph') return asLines(prose(contentOf(b), title))
  return asLines(guardStart(escape(blockText(b))))
}

export const bodyMarkdown = (blocks: Block[], title: Title) =>
  blocks
    .map((b) => lines(b, title))
    .filter((l) => l.length)
    .map((l) => l.join('\n'))
    .join('\n\n')

function frontMatter(tags: string[], notebook?: string) {
  const rows = [...(tags.length ? [`tags: ${JSON.stringify(tags)}`] : []), ...(notebook ? [`notebook: ${JSON.stringify(notebook)}`] : [])]
  return rows.length ? ['---', ...rows, '---'].join('\n') : ''
}

export function toMarkdown(n: Note, {title, notebook}: {title: Title; notebook?: string}): string {
  const parts = [frontMatter(n.tags, notebook), n.title.trim() ? `# ${n.title.trim()}` : '', bodyMarkdown(n.blocks, title)].filter(Boolean)
  return parts.length ? `${parts.join('\n\n')}\n` : ''
}

const safe = (t: string) =>
  t
    .replace(/\s*[/\\:*?"<>|\x00-\x1f]+\s*/g, ' - ')
    .replace(/^[\s.-]+|[\s-]+$/g, '')
    .slice(0, 100)
    .trim() || 'Untitled'

export function fileNames(titles: string[]): string[] {
  const used = new Set<string>()
  return titles.map((t) => {
    const stem = safe(t)
    let name = stem
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${stem} ${k}`
    used.add(name.toLowerCase())
    return `${name}.md`
  })
}
