import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import tokens from '../../../design/tokens.json' with {type: 'json'}
import {toCss, tokenCss, type Tokens} from './tokens.ts'

const SRC = new URL('..', import.meta.url).pathname
const files = (readdirSync(SRC, {recursive: true}) as string[]).filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith('.test.ts'))
const read = (f: string) => readFileSync(join(SRC, f), 'utf8')

const COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(|:\s*(white|black|red|green|blue|gray|grey)\b/i
const BIG_PX = /(?<![\w.-])(?:[4-9]|\d{2,})(?:\.\d+)?px/

function rawStyle(file: string, text: string): string[] {
  const css = file.endsWith('.css')
  return text.split('\n').flatMap((line, i) => {
    const where = `${file}:${i + 1}`
    const hits = []
    if (COLOUR.test(line.replace(/url\([^)]*\)/g, ''))) hits.push(`${where} raw colour`)
    if (css && !line.trim().startsWith('@media') && BIG_PX.test(line)) hits.push(`${where} raw px`)
    return hits
  })
}

test('light lives on :root; dark follows the system unless light is picked, and data-theme=dark forces it', () => {
  const css = toCss({type: {'fs-s': '12px'}, light: {'c-bg': '#fff'}, dark: {'c-bg': '#000'}} as Tokens)
  assert.match(css, /^:root \{ --fs-s: 12px; --c-bg: #fff; color-scheme: light; \}/)
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{ --c-bg: #000; color-scheme: dark; \} \}/)
  assert.match(css, /:root\[data-theme="dark"\] \{ --c-bg: #000; color-scheme: dark; \}/)
})

test('light and dark name the same colours, and every token reaches the CSS', () => {
  assert.deepEqual(Object.keys(tokens.light).sort(), Object.keys(tokens.dark).sort())
  for (const group of Object.values(tokens)) for (const k of Object.keys(group)) assert.ok(tokenCss.includes(`--${k}:`), k)
})

test('the guard catches raw colours and big px values', () => {
  assert.equal(rawStyle('a.css', '.x { color: #fff; }').length, 1)
  assert.equal(rawStyle('a.css', '.x { box-shadow: 0 0 2px rgba(0,0,0,.1); }').length, 1)
  assert.equal(rawStyle('a.css', '.x { background: white; }').length, 1)
  assert.equal(rawStyle('a.css', '.x { padding: 12px; }').length, 1)
  assert.equal(rawStyle('a.tsx', "<i style={{color: '#3a62b5'}} />").length, 1)
  assert.deepEqual(rawStyle('a.css', '.x { border: 1px solid var(--c-border); padding: var(--sp-2); }'), [])
  assert.deepEqual(rawStyle('a.css', '@media (max-width: 700px) {'), [])
})

test('app styles and components use tokens only: no raw colours, no px beyond hairlines', () => {
  const hits = files.filter((f) => f !== 'styles/tokens.ts').flatMap((f) => rawStyle(f, read(f)))
  assert.deepEqual(hits, [])
})

test('every var(--…) the app reads is a token or a canvas variable the app sets', () => {
  const all = files.map(read).join('\n')
  const defined = new Set([...Object.values(tokens).flatMap((g) => Object.keys(g)), ...[...all.matchAll(/--([\w-]+):/g)].map((m) => m[1])])
  const used = new Set([...all.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]))
  assert.deepEqual([...used].filter((v) => !v.endsWith('-') && !defined.has(v)), [])
})
