import {readdirSync, statSync} from 'node:fs'
import {join} from 'node:path'

const HINT = 'run pnpm e2e (builds first)'

export function staleDist(app: string): string | null {
  const built = statSync(join(app, 'dist/server/server.js'), {throwIfNoEntry: false})?.mtimeMs
  if (built === undefined) return `app/dist is missing: ${HINT}`
  const newer = readdirSync(join(app, 'src'), {recursive: true, withFileTypes: true}).find((e) => e.isFile() && statSync(join(e.parentPath, e.name)).mtimeMs > built)
  return newer ? `app/dist is older than ${join(newer.parentPath, newer.name)}: ${HINT}` : null
}
