import {execFile} from 'node:child_process'

const MARK = '__BARKEVER_PATH__'
const KNOWN = ['/opt/homebrew/bin', '/usr/local/bin']

export const pathFromShell = (out: string) => (out.includes(MARK) ? out.split(MARK).at(-1)!.trim().split('\n')[0] : undefined) || undefined

export function mergePath(...paths: (string | undefined)[]): string {
  return [...new Set(paths.flatMap((p) => p?.split(':') ?? []).filter(Boolean))].join(':')
}

export const knownPath = (home: string) => mergePath(process.env.PATH, `${home}/.local/bin`, ...KNOWN)

export function loginShellPath(shell = process.env.SHELL || '/bin/zsh', timeout = 5000): Promise<string | undefined> {
  return new Promise((done) =>
    execFile(shell, ['-ilc', `echo ${MARK}; printenv PATH`], {timeout, encoding: 'utf8'}, (err, out) => done(err ? undefined : pathFromShell(out))),
  )
}
