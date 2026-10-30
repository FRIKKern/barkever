import {query} from '@anthropic-ai/claude-agent-sdk'
import type {Provider} from './provider.ts'

type Usage = {input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number}

const tokens = (u: Usage) => u.input_tokens + u.output_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens

export const claude = (bin: string): Provider => ({
  name: 'claude',
  async run({system, prompt, schema, cwd, env, timeoutMs}) {
    let model = ''
    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), timeoutMs)
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
    try {
      for await (const m of query({prompt, options})) {
        if (m.type === 'system' && m.subtype === 'init') model = m.model
        if (m.type !== 'result') continue
        if (m.subtype !== 'success') throw new Error(m.errors.join('; '))
        if (m.is_error) throw new Error(m.result)
        return {data: m.structured_output, model, tokens: tokens(m.usage as Usage), costUsd: m.total_cost_usd}
      }
      throw new Error('claude stopped without an answer')
    } finally {
      clearTimeout(timer)
    }
  },
})
