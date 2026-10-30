import {accessSync, constants, statSync} from 'node:fs'
import {join} from 'node:path'

export type Call = {system: string; prompt: string; schema: Record<string, unknown>; cwd: string; env: Record<string, string>; timeoutMs: number}
export type Reply = {data: unknown; model: string; tokens: number; costUsd: number | null}
export type Provider = {name: string; run(call: Call): Promise<Reply>}

const KEPT = ['HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'SHELL', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR'] as const

export function childEnv(env: NodeJS.ProcessEnv, path: string): Record<string, string> {
  const out: Record<string, string> = {PATH: path}
  for (const key of KEPT) if (env[key]) out[key] = env[key]
  return out
}

function runnable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return statSync(file).isFile()
  } catch {
    return false
  }
}

export const findTool = (name: string, path: string) => path.split(':').map((dir) => join(dir, name)).find(runnable)
