import {existsSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'

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
