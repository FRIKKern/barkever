export const BARKPARK = 'https://guerrilla.barkpark.cloud'

const PASSED = ['BARKPARK_WORKSPACE', 'BARKPARK_PROJECT', 'BARKPARK_DATASET', 'HOME', 'USER', 'LANG', 'TMPDIR'] as const

export function serverEnv(env: NodeJS.ProcessEnv, secret: string, path: string): Record<string, string> {
  const out: Record<string, string> = {NODE_ENV: 'production', PATH: path, BARKPARK_URL: env.BARKPARK_URL || BARKPARK, BARKEVER_SESSION_SECRET: secret}
  for (const key of PASSED) if (env[key]) out[key] = env[key]
  return out
}
