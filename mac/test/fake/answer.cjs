const {appendFileSync, existsSync, readdirSync, readFileSync} = require('node:fs')
const {basename, join} = require('node:path')

const HERE = __dirname
const FORBIDDEN = /API_KEY|AUTH_TOKEN|OAUTH_TOKEN|^CLAUDECODE$|^CLAUDE_CODE_SSE_PORT$|^OPENAI_|^CODEX_(?!HOME$)/

function behavior(cli) {
  const file = join(HERE, 'behavior.json')
  return (existsSync(file) && JSON.parse(readFileSync(file, 'utf8'))[cli]) || 'answer'
}

const open = (args, flag) => !` ${args.join(' ')} `.includes(` ${flag} `)
const dirHas = (dir) => existsSync(dir) && readdirSync(dir).length > 0

function doors(cli, args) {
  const home = process.env.HOME
  if (cli === 'claude') {
    const own = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')
    const settings = open(args, '--setting-sources=')
    return [
      ['settings.json', existsSync(join(own, 'settings.json')) && settings],
      ['CLAUDE.md', existsSync(join(own, 'CLAUDE.md')) && settings],
      ['rules', dirHas(join(own, 'rules')) && settings],
      ['skills', dirHas(join(own, 'skills')) && settings],
      ['agents', dirHas(join(own, 'agents')) && settings],
      ['~/.claude.json MCP', existsSync(join(home, '.claude.json')) && open(args, '--strict-mcp-config')],
    ]
  }
  const own = process.env.CODEX_HOME || join(home, '.codex')
  return [
    ['config.toml', existsSync(join(own, 'config.toml')) && open(args, '--ignore-user-config')],
    ['AGENTS.md', existsSync(join(own, 'AGENTS.md'))],
    ['AGENTS.override.md', existsSync(join(own, 'AGENTS.override.md'))],
    ['rules', dirHas(join(own, 'rules')) && open(args, '--ignore-rules')],
    ['hooks.json', existsSync(join(own, 'hooks.json')) && open(args, '--disable hooks')],
    ['skills', dirHas(join(own, 'skills'))],
    ['~/.agents/skills', dirHas(join(home, '.agents', 'skills'))],
    ['memories', dirHas(join(own, 'memories'))],
    ['agents', dirHas(join(own, 'agents'))],
  ]
}

const leaks = (cli, args) => doors(cli, args).filter(([, leak]) => leak).map(([name]) => name)

function record(cli, call) {
  appendFileSync(join(HERE, 'calls.jsonl'), JSON.stringify({cli, pid: process.pid, cwd: process.cwd(), env: Object.keys(process.env), home: process.env.HOME, codexHome: process.env.CODEX_HOME, ...call}) + '\n')
}

function refusal(cli, args, flags, own = []) {
  const keys = Object.keys(process.env).filter((k) => FORBIDDEN.test(k))
  if (keys.length) return `fake ${cli}: refused, the environment carries ${keys.join(', ')}`
  if (!basename(process.cwd()).startsWith('barkever-ai-') || readdirSync(process.cwd()).some((f) => !own.includes(f))) return `fake ${cli}: refused, not run in a fresh empty folder`
  const missing = flags.filter((f) => !f.ok)
  if (missing.length) return `fake ${cli}: refused, ${missing.map((f) => f.name).join(', ')}`
  const leaked = leaks(cli, args)
  if (leaked.length) return `fake ${cli}: refused, user config reached the model: ${leaked.join(', ')}`
  if (cli === 'codex' && !existsSync(join(process.env.CODEX_HOME, 'auth.json'))) return `fake codex: not signed in`
  if (behavior(cli) === 'fail') return `fake ${cli}: not signed in`
}

const hangs = (cli) => behavior(cli) === 'hang' && (process.on('SIGTERM', () => appendFileSync(join(HERE, 'sigterm'), `${process.pid}\n`)), appendFileSync(join(HERE, 'trapped'), `${cli} ${process.pid}\n`), setInterval(() => {}, 1000))

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

module.exports = {behavior, hangs, record, refusal, reply}
