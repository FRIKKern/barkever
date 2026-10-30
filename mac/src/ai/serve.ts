import {ask, type Ai, type AskRequest, type Asked} from './ask.ts'
import {claude} from './claude.ts'
import {codex} from './codex.ts'
import {findTool, type Provider} from './provider.ts'

const MAKERS = {claude, codex}

export const installed = (path: string): Provider[] =>
  Object.entries(MAKERS).flatMap(([name, make]) => {
    const bin = findTool(name, path)
    return bin ? [make(bin)] : []
  })

export type Sender = {senderFrame: {url: string} | null}

export const OTHER_ORIGIN = 'Ask answers Barkever only.'

export function askHandler(origin: string, ai: () => Ai) {
  return async (e: Sender, req: AskRequest): Promise<Asked | {error: string}> => {
    try {
      if (new URL(e.senderFrame!.url).origin !== origin) return {error: OTHER_ORIGIN}
      return await ask(req, ai())
    } catch (err) {
      return {error: (err as Error).message}
    }
  }
}
