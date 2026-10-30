import {query} from '@anthropic-ai/claude-agent-sdk'
import type {Provider, Reply} from './provider.ts'

type Usage = {input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number}

const tokens = (u: Usage) => u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens

async function answer(messages: ReturnType<typeof query>): Promise<Reply> {
  let model = ''
  for await (const m of messages) {
    if (m.type === 'system' && m.subtype === 'init') model = m.model
    if (m.type !== 'result') continue
    if (m.subtype !== 'success') throw new Error(m.errors.join('; '))
    if (m.is_error) throw new Error(m.result)
    return {data: m.structured_output, model, tokens: tokens(m.usage as Usage), costUsd: m.total_cost_usd}
  }
  throw new Error('claude stopped without an answer')
}

export const claude = (bin: string): Provider => ({
  name: 'claude',
  async run({system, prompt, schema, cwd, env, timeoutMs}) {
    const abortController = new AbortController()
    const options = {
      pathToClaudeCodeExecutable: bin,
      cwd,
      env,
      systemPrompt: system,
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      tools: [],
      maxTurns: 3,
      persistSession: false,
      outputFormat: {type: 'json_schema' as const, schema},
      abortController,
    }
    let timer: NodeJS.Timeout | undefined
    const late = new Promise<never>((_, fail) => {
      timer = setTimeout(() => {
        fail(new Error(`claude gave no answer in ${timeoutMs / 1000} s`))
        abortController.abort()
      }, timeoutMs)
    })
    try {
      return await Promise.race([answer(query({prompt, options})), late])
    } finally {
      clearTimeout(timer)
    }
  },
})
