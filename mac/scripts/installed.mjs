import {existsSync, readFileSync, realpathSync} from 'node:fs'
import {dirname, join} from 'node:path'

function locate(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const found = join(dir, 'node_modules', name)
    if (existsSync(found)) return realpathSync(found)
    if (dir === dirname(dir)) throw new Error(`${name} is not installed where ${from} looks for it`)
  }
}

export function installedClosure(roots) {
  const picked = new Map()
  const visit = (name, from) => {
    const dir = locate(name, from)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const seen = picked.get(name)
    if (seen) {
      if (seen.version !== pkg.version) throw new Error(`two versions of ${name}: ${seen.version} and ${pkg.version}`)
      return
    }
    picked.set(name, {dir, version: pkg.version})
    for (const dep of Object.keys({...pkg.dependencies, ...pkg.peerDependencies})) visit(dep, dir)
  }
  for (const [name, from] of roots) visit(name, from)
  return picked
}
