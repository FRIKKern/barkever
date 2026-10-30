import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {Budget} from './budget.ts'
import type {Call, Provider, Reply} from './provider.ts'

export type Answered<T> = Omit<Reply, 'data'> & {data: T; provider: string}

export const SPENT = 'Today’s AI budget is used up. It starts again tomorrow.'
export const NONE = 'Neither claude nor codex is installed. Install one and sign in.'

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function firstAnswer<T>(providers: Provider[], budget: Budget, call: Omit<Call, 'cwd'>, accept: (data: unknown) => T): Promise<Answered<T>> {
  if (budget.left() <= 0) throw new Error(SPENT)
  if (!providers.length) throw new Error(NONE)
  const failed: string[] = []
  for (const p of providers) {
    const cwd = mkdtempSync(join(tmpdir(), 'barkever-ai-'))
    try {
      const reply = await p.run({...call, cwd})
      budget.spend(reply.tokens)
      return {...reply, data: accept(reply.data), provider: p.name}
    } catch (e) {
      failed.push(`${p.name}: ${reason(e)}`)
    } finally {
      rmSync(cwd, {recursive: true, force: true})
    }
  }
  throw new Error(failed.join(' · '))
}
