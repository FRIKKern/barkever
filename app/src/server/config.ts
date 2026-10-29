export function barkparkConfig(env: NodeJS.ProcessEnv = process.env) {
  const need = (key: string) => {
    const v = env[key]
    if (!v) throw new Error(`missing ${key} (see app/.env.example)`)
    return v
  }
  return {
    origin: need('BARKPARK_URL'),
    base: `${need('BARKPARK_URL')}/w/${env.BARKPARK_WORKSPACE || 'barkever'}/p/${env.BARKPARK_PROJECT || 'default'}`,
    dataset: env.BARKPARK_DATASET || 'fixtures',
    token: () => need('BARKPARK_TOKEN'),
  }
}
