import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import profile from '../../../host-profile/barkever.json' with {type: 'json'}
import {tokenCss} from './tokens.ts'

const FRAME = {
  '--bp-codeblock-lh': 'line-height',
  '--bp-codeblock-margin': 'margin',
  '--bp-codeblock-pad': 'padding',
  '--bp-codeblock-radius': 'border-radius',
  '--bp-codeblock-size': 'font-size',
}
const editorCss = readFileSync(new URL('editor.css', import.meta.url), 'utf8')
const editorDefaults = readFileSync(new URL('../../node_modules/portable-doc/goldens/css/paper-surface.css', import.meta.url), 'utf8')
  .match(/--bp-[\w-]+:[^;{}]+;/g)!
  .join(' ')
const pre = `<pre class="bp-codeblock" style="${Object.entries(FRAME).map(([token, prop]) => `${prop}: var(${token})`).join('; ')}">a</pre>`

function frames() {
  const {document} = new Window()
  document.head.innerHTML = `<style>${tokenCss}</style><style>:root { ${editorDefaults} }</style><style>${editorCss}</style>`
  document.body.innerHTML = `<div class="doc-body"><div class="blocks">${pre}</div><bp-paper-canvas>${pre}</bp-paper-canvas></div>`
  const [read, edit] = [...document.querySelectorAll('pre')].map((el) => document.defaultView!.getComputedStyle(el))
  return Object.entries(FRAME).map(([token, prop]) => [token, read.getPropertyValue(prop), edit.getPropertyValue(prop)])
}

test('a code block has the same frame read and edited', () => {
  for (const [token, read, edit] of frames()) {
    assert.ok(read, `${token} draws nothing in the read view`)
    assert.equal(edit, read, `${token}: read ${read}, edited ${edit}`)
  }
})

test('the code block frame is set once, where both views inherit it, and the profile lists it as used', () => {
  for (const token of Object.keys(FRAME)) assert.equal(editorCss.split(`${token}:`).length - 1, 1, `${token} is set more than once`)
  assert.match(editorCss, /^\.doc-body \{[^}]*--bp-codeblock-radius:/m)
  const used = profile.uses.css.token
  assert.deepEqual(Object.keys(FRAME).filter((token) => !used.includes(token)), [])
})
