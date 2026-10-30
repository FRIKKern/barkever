import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

const IMPORT = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g
const PACKAGE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w./-]+)?$/

export const packageOf = (specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

export const bareImports = (code) =>
  [...code.matchAll(IMPORT)].map((m) => m[1]).filter((s) => PACKAGE.test(s)).map(packageOf)

export function bundlePackages(dir) {
  const files = readdirSync(dir, {recursive: true}).filter((f) => f.endsWith('.js'))
  return [...new Set(files.flatMap((f) => bareImports(readFileSync(join(dir, f), 'utf8'))))].sort()
}
