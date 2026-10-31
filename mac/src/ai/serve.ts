import {ask, type Ai, type AskRequest, type Asked} from './ask.ts'
import {claude} from './claude.ts'
import {codex} from './codex.ts'
import {findTool, type Provider} from './provider.ts'
import {AI_OFF, type AiSwitch} from './switch.ts'

const MAKERS = {claude, codex}

export const installed = (path: string): Provider[] =>
  Object.entries(MAKERS).flatMap(([name, make]) => {
    const bin = findTool(name, path)
    return bin ? [make(bin)] : []
  })

type Sender = {senderFrame: {url: string} | null}

export const OTHER_ORIGIN = 'Ask answers Barkever only.'

const fromApp = (e: Sender, origin: string) => new URL(e.senderFrame!.url).origin === origin

export function askHandler(origin: string, power: AiSwitch, ai: () => Ai) {
  return async (e: Sender, req: AskRequest): Promise<Asked | {error: string}> => {
    try {
      if (!fromApp(e, origin)) return {error: OTHER_ORIGIN}
      if (!power.on()) return {error: AI_OFF}
      return await ask(req, ai())
    } catch (err) {
      return {error: (err as Error).message}
    }
  }
}

export const switchHandler = (origin: string, power: AiSwitch) => (e: Sender, on: unknown) => {
  if (fromApp(e, origin)) power.set(on === true)
}
