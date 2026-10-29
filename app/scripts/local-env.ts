import {existsSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {loadEnv} from 'vite'

const APP = fileURLToPath(new URL('..', import.meta.url))

export function loadServerEnv(mode: string, fromCli: boolean, env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(loadEnv(mode, APP, ['BARKPARK_', 'BARKEVER_SESSION_SECRET', 'BARKEVER_SHARED_TOKEN']))) env[key] ??= value
  if (fromCli) fillFromBarkparkCli(env)
}

export function fillFromBarkparkCli(env: NodeJS.ProcessEnv = process.env, path = `${homedir()}/.config/barkpark/config.json`): void {
  if (env.CI || env.VERCEL || (env.BARKPARK_URL && env.BARKPARK_TOKEN) || !existsSync(path)) return
  let cfg: {server?: string; token?: string}
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return // unreadable is the same as absent: the server names the missing variable
  }
  if (env.BARKPARK_URL && env.BARKPARK_URL !== cfg.server) return
  env.BARKPARK_URL ||= cfg.server
  env.BARKPARK_TOKEN ||= cfg.token
}
