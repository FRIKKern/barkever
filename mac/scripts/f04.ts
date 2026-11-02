import {query} from '@anthropic-ai/claude-agent-sdk'
import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {childEnv, findTool} from '../src/ai/provider.ts'

const PIN = '82be3a836686f111bfad835649138bac846008a9'
const CONCURRENCY = 2
const TIMEOUT_MS = 600_000
const ROOT = resolve(import.meta.dirname, '../..')
const OUT = join(ROOT, 'docs/f04')

const SYSTEM = `You write documents in PortableDoc, a JSON block format: an object with a "blocks" array.
The portable-doc tools: validate checks a doc against the spec, explain turns its errors into plain words, apply_ops edits a doc. render is switched off in this run.
Write the document the user asks for. Validate it. If validate reports errors, use explain, fix them and validate again.
Use made-up names only, never a real person, email or account.
Answer only with a doc that validate accepted, unchanged.`

const EMAIL = /[\w.%+-]+@[\w-]+\.[\w.-]+/

const SCHEMA = {
  type: 'object',
  properties: {doc: {type: 'object', description: 'The PortableDoc validate accepted: an object with a blocks array'}},
  required: ['doc'],
  additionalProperties: false,
}

const TOOLS = ['validate', 'explain', 'apply_ops', 'render']

type Prompt = {id: string; prompt: string}
type Run = {
  id: string
  prompt: string
  model: string
  firstValidate: boolean | null
  calls: Record<string, number>
  turns: number
  tokens: number
  costUsd: number | null
  seconds: number
  failure: string | null
  doc: unknown
  js: string[] | null
  elixir: string[] | null
}

const [pd, api, count] = process.argv.slice(2)
if (!pd || !api) {
  console.error('usage: node --experimental-strip-types mac/scripts/f04.ts <portable-doc checkout> <barkpark api dir> [count]')
  process.exit(2)
}
const head = execFileSync('git', ['-C', pd, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()
if (head !== PIN) {
  console.error(`f04: ${pd} is at ${head}, not the pinned ${PIN}`)
  process.exit(2)
}

const {validate} = await import(resolve(pd, 'packages/validate/index.js'))
const prompts: Prompt[] = JSON.parse(readFileSync(join(ROOT, 'fixtures/f04/prompts.json'), 'utf8')).slice(0, count ? Number(count) : undefined)
const path = process.env.PATH ?? ''
const bin = findTool('claude', path)
if (!bin) throw new Error('f04: no claude on PATH')

const textOf = (content: unknown) =>
  Array.isArray(content) ? content.map((c: {type?: string; text?: string}) => (c.type === 'text' ? c.text : '')).join('') : String(content ?? '')

const okOf = (text: string) => {
  try {
    return JSON.parse(text).ok === true
  } catch {
    return false
  }
}

async function runOne({id, prompt}: Prompt): Promise<Run> {
  const run: Run = {id, prompt, model: '', firstValidate: null, calls: Object.fromEntries(TOOLS.map((t) => [t, 0])), turns: 0, tokens: 0, costUsd: null, seconds: 0, failure: null, doc: null, js: null, elixir: null}
  const validateIds = new Set<string>()
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS)
  const started = Date.now()
  try {
    const messages = query({
      prompt,
      options: {
        pathToClaudeCodeExecutable: bin,
        cwd: mkdtempSync(join(tmpdir(), 'barkever-f04-')),
        env: childEnv(process.env, path),
        systemPrompt: SYSTEM,
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: {pd: {type: 'stdio', command: process.execPath, args: [resolve(pd, 'packages/mcp/bin/portable-doc-mcp.mjs')], env: {PATH: path}}},
        tools: [],
        allowedTools: TOOLS.map((t) => `mcp__pd__${t}`),
        maxTurns: 30,
        persistSession: false,
        outputFormat: {type: 'json_schema' as const, schema: SCHEMA},
        abortController,
      },
    })
    for await (const m of messages) {
      if (m.type === 'system' && m.subtype === 'init') run.model = m.model
      if (m.type === 'assistant')
        for (const c of m.message.content as {type: string; name?: string; id?: string}[]) {
          const tool = c.type === 'tool_use' && c.name?.startsWith('mcp__pd__') ? c.name.slice('mcp__pd__'.length) : undefined
          if (!tool) continue
          run.calls[tool] = (run.calls[tool] ?? 0) + 1
          if (tool === 'validate') validateIds.add(c.id!)
        }
      if (m.type === 'user' && Array.isArray(m.message.content))
        for (const c of m.message.content as {type: string; tool_use_id?: string; content?: unknown}[])
          if (c.type === 'tool_result' && run.firstValidate === null && validateIds.has(c.tool_use_id!)) run.firstValidate = okOf(textOf(c.content))
      if (m.type !== 'result') continue
      run.turns = m.num_turns
      run.costUsd = m.total_cost_usd
      const u = m.usage as {input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number}
      run.tokens = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
      if (m.subtype !== 'success' || m.is_error) run.failure = m.subtype === 'success' ? String(m.result) : m.subtype
      else run.doc = (m.structured_output as {doc?: unknown} | undefined)?.doc ?? null
    }
  } catch (e) {
    run.failure = (e as Error).message
  } finally {
    clearTimeout(timer)
    run.seconds = Math.round((Date.now() - started) / 1000)
  }
  const r = validate(run.doc)
  const js: string[] = r.ok ? [] : r.errors.map((e: {code: string; path: string}) => `${e.code} at ${e.path}`)
  run.js = js
  console.log(`${id} ${run.model} first=${run.firstValidate} js=${js.length} calls=${JSON.stringify(run.calls)} ${run.failure ?? ''}`)
  return run
}

async function pool(items: Prompt[]) {
  const runs: Run[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      runs[i] = await runOne(items[i])
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker))
  return runs
}

const ELIXIR = `"F04_DOCS" |> System.fetch_env!() |> File.read!() |> Jason.decode!() |> Enum.each(fn %{"id" => id, "doc" => doc} ->
  errors = case Barkpark.PortableDoc.Validate.validate(doc) do
    :ok -> []
    {:error, errors} -> Enum.map(errors, &"#{&1.code} at #{&1.path}")
  end
  IO.puts("F04 " <> Jason.encode!(%{id: id, errors: errors}))
end)`

function elixir(runs: Run[]) {
  const file = join(mkdtempSync(join(tmpdir(), 'barkever-f04-docs-')), 'docs.json')
  writeFileSync(file, JSON.stringify(runs.map(({id, doc}) => ({id, doc}))))
  const out = execFileSync('mix', ['run', '--no-start', '-e', ELIXIR], {cwd: api, encoding: 'utf8', env: {...process.env, MIX_ENV: 'test', F04_DOCS: file}, maxBuffer: 64 * 1024 * 1024})
  const byId = new Map(out.split('\n').filter((l) => l.startsWith('F04 ')).map((l) => JSON.parse(l.slice(4))).map((r: {id: string; errors: string[]}) => [r.id, r.errors]))
  for (const run of runs) run.elixir = byId.get(run.id) ?? null
}

const barkpark = execFileSync('git', ['-C', api, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim()
const claudeVersion = execFileSync(bin, ['--version'], {encoding: 'utf8'}).trim()
const runs = await pool(prompts)
elixir(runs)

const valid = (r: Run) => r.failure === null && r.js?.length === 0 && r.elixir?.length === 0
const sum = (f: (r: Run) => number) => runs.reduce((n, r) => n + f(r), 0)
const models = [...new Set(runs.map((r) => r.model))].join(', ')
const yes = (b: boolean | null) => (b === null ? 'none' : b ? 'yes' : 'no')

const report = `# F04: AI-written docs through the PortableDoc MCP server

| Docs | Valid (JS and Elixir) | Invalid | First draft valid | Failed runs | Model | Cost (CLI estimate) |
|---|---|---|---|---|---|---|
| ${runs.length} | ${runs.filter(valid).length} | ${runs.filter((r) => !valid(r)).length} | ${runs.filter((r) => r.firstValidate).length} | ${runs.filter((r) => r.failure).length} | ${models} | ≈ $${sum((r) => r.costUsd ?? 0).toFixed(2)} |

\`\`\`
fixtures/f04/prompts.json ──► claude ${claudeVersion}, owner login, decision 0007 sandbox
                               (no API keys, temp cwd, no settings, strict MCP, no built-in tools)
                               └─► portable-doc-mcp @ ${PIN.slice(0, 7)}: validate · explain · apply_ops · render (off)
final doc ──► @portable-doc/validate @ ${PIN.slice(0, 7)}  +  Barkpark.PortableDoc.Validate @ ${barkpark.slice(0, 10)}
\`\`\`

Run with \`node --experimental-strip-types mac/scripts/f04.ts <portable-doc @ ${PIN.slice(0, 7)}> <barkpark api>\`, concurrency ${CONCURRENCY}. Prompts are synthetic. Every doc and count is in [runs.json](runs.json). Valid means schema-valid: both validators accept the doc. It says nothing about whether the content is good.

| Id | Model | First draft valid | validate · explain · apply_ops calls | Turns | Tokens | ≈ Cost | JS | Elixir |
|---|---|---|---|---|---|---|---|---|
${runs.map((r) => `| ${r.id} | ${r.model} | ${yes(r.firstValidate)} | ${r.calls.validate} · ${r.calls.explain} · ${r.calls.apply_ops} | ${r.turns} | ${r.tokens} | $${(r.costUsd ?? 0).toFixed(3)} | ${r.failure ? `failed: ${r.failure}` : r.js?.length ? r.js.join('; ') : 'valid'} | ${r.elixir === null ? 'not run' : r.elixir.length ? r.elixir.join('; ') : 'valid'} |`).join('\n')}
`

const leaked = runs.filter((r) => EMAIL.test(JSON.stringify(r.doc))).map((r) => r.id)
if (leaked.length) throw new Error(`an email address is in ${leaked.join(', ')}: redact the doc before it is written`)

mkdirSync(OUT, {recursive: true})
writeFileSync(join(OUT, 'runs.json'), JSON.stringify({pin: PIN, barkpark, claude: claudeVersion, runs}, null, 2) + '\n')
writeFileSync(join(OUT, 'REPORT.md'), report)
console.log(`f04: ${runs.filter(valid).length}/${runs.length} valid, report in docs/f04/REPORT.md`)
