import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const app = fileURLToPath(new URL('../..', import.meta.url))
const render = `
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {Blocks} from './src/ui/Blocks.tsx'
const blocks = [
  {id: 'c', type: 'code', lang: 'ts', value: 'const a = 1\\n  return <a>'},
  {id: 'k', type: 'code', code: 'plain'},
  {id: 'd', type: 'divider'},
  {id: 'i', type: 'image', src: 'https://example.com/cat.png', alt: 'A cat'},
  {id: 'j', type: 'image', src: ' javascript:alert(1)', alt: 'Bad'},
  {id: 'x', type: 'image', src: 'data:image/png;base64,AAAA', alt: 'Inline'},
  {id: 'q', type: 'pullquote', content: [{type: 'text', value: 'Said once'}]},
]
process.stdout.write(renderToStaticMarkup(createElement(Blocks, {blocks, s: {}, title: () => undefined})))
`

test('code, dividers, images and quotes show in the read-only view; images never load from script or data links', () => {
  const html = execFileSync('node_modules/.bin/tsx', ['--eval', render], {cwd: app, encoding: 'utf8', timeout: 60_000})
  assert.match(html, /<pre class="bp-codeblock" data-lang="ts" style="[^"]*white-space:pre">const a = 1\n {2}return &lt;a&gt;<\/pre>/)
  assert.match(html, /<pre class="bp-codeblock" style="[^"]*">plain<\/pre>/)
  assert.match(html, /<div class="bp-section-divider" style="[^"]*"><span class="bp-section-divider__mark" style="[^"]*">§<\/span><\/div>/)
  assert.match(html, /<img src="https:\/\/example.com\/cat.png" alt="A cat" loading="lazy"/)
  assert.match(html, /<img alt="Bad" loading="lazy"/)
  assert.match(html, /<img alt="Inline" loading="lazy"/)
  assert.doesNotMatch(html, /javascript:|data:image/)
  assert.match(html, /<p class="bp-role-pullquote" style="font-style:italic">Said once<\/p>/)
})
