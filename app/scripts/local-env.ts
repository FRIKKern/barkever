// Dev-only: fill BARKPARK_URL and BARKPARK_TOKEN from the bp CLI's login
// (~/.config/barkpark/config.json) when neither the shell nor app/.env.local set them.
// Only vite.config.ts calls this, for `vite dev` and `vite preview`, never for a build,
// in CI or on Vercel. It never enters a bundle. Values are never printed.
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
  // A token belongs to its server: never pair the CLI's token with another BARKPARK_URL.
  if (env.BARKPARK_URL && env.BARKPARK_URL !== cfg.server) return
  env.BARKPARK_URL ||= cfg.server
  env.BARKPARK_TOKEN ||= cfg.token
}
