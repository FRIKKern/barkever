const {appendFileSync, existsSync, readdirSync, readFileSync} = require('node:fs')
const {basename, join} = require('node:path')

const HERE = __dirname
const FORBIDDEN = /API_KEY|AUTH_TOKEN|OAUTH_TOKEN|^CLAUDECODE$|^CLAUDE_CODE_SSE_PORT$|^OPENAI_|^CODEX_(?!HOME$)/

function behavior(cli) {
  const file = join(HERE, 'behavior.json')
  return (existsSync(file) && JSON.parse(readFileSync(file, 'utf8'))[cli]) || 'answer'
}

function userInstructions() {
  const file = join(process.env.CODEX_HOME || join(process.env.HOME, '.codex'), 'AGENTS.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

function record(cli, call) {
  appendFileSync(join(HERE, 'calls.jsonl'), JSON.stringify({cli, cwd: process.cwd(), env: Object.keys(process.env), ...call}) + '\n')
}

function refusal(cli, flags, own = []) {
  const keys = Object.keys(process.env).filter((k) => FORBIDDEN.test(k))
  if (keys.length) return `fake ${cli}: refused, the environment carries ${keys.join(', ')}`
  if (!basename(process.cwd()).startsWith('barkever-ai-') || readdirSync(process.cwd()).some((f) => !own.includes(f))) return `fake ${cli}: refused, not run in a fresh empty folder`
  const missing = flags.filter((f) => !f.ok)
  if (missing.length) return `fake ${cli}: refused, ${missing.map((f) => f.name).join(', ')}`
  if (behavior(cli) === 'fail') return `fake ${cli}: not signed in`
}

const hangs = (cli) => behavior(cli) === 'hang' && (process.on('SIGTERM', () => {}), setInterval(() => {}, 1000))

const WORD = /[\p{L}\p{N}]{4,}/gu

function answerFor(prompt) {
  const question = /^Question: (.*)$/m.exec(prompt)[1].toLowerCase()
  const notes = [...prompt.matchAll(/^\{.*\}$/gm)].map((m) => JSON.parse(m[0]))
  const words = question.match(WORD) || []
  const hits = notes
    .map((n) => ({n, quote: n.text.split(/(?<=[.!?])\s+|\n+/).find((s) => words.some((w) => s.toLowerCase().includes(w)))}))
    .filter((h) => h.quote)
    .slice(0, 3)
  if (!hits.length) return {found: false, answer: 'No note says this.', citations: []}
  return {found: true, answer: hits.map((h, i) => `${h.n.title} [${i + 1}]`).join(', ') + '.', citations: hits.map((h) => ({id: h.n.id, quote: h.quote}))}
}

function reply(cli, prompt) {
  const b = behavior(cli)
  return typeof b === 'object' ? b.reply : answerFor(prompt)
}

module.exports = {behavior, hangs, record, refusal, reply, userInstructions}
