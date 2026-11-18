import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const app = fileURLToPath(new URL('../..', import.meta.url))
const render = `
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {SignInCard} from './src/ui/SignInCard.tsx'
process.stdout.write(renderToStaticMarkup(createElement(SignInCard, {send: async () => ({ok: true}), onIn() {}})))
`

test('the sign-in page as served, before scripts run, posts its form and keeps Sign in shut', () => {
  const html = execFileSync('node_modules/.bin/tsx', ['--eval', render], {cwd: app, encoding: 'utf8', timeout: 60_000})
  const form = html.match(/<form[^>]*>/)?.[0] ?? ''
  assert.match(form, /method="post"/)
  assert.doesNotMatch(form, /action=/)
  assert.match(html, /<input[^>]*name="password"/)
  assert.match(html.match(/<button[^>]*>/)?.[0] ?? '', /disabled/)
})
