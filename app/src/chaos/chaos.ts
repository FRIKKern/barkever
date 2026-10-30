import {plan, type Plan, type Step} from './plan.ts'
import {world} from './world.ts'
import {show} from './edits.ts'
import type {Failure} from './judge.ts'

export type Run = {plan: Plan; failure?: Failure; copies: number; log: string[]; server: string}

export async function replay(p: Plan): Promise<Run> {
  const w = world(p.setup)
  const failure = await w.run(p.steps)
  return {plan: p, failure, copies: w.server.conflicts?.length ?? 0, log: w.log, server: show(w.server)}
}

export const run = (seed: number, solo = false) => replay(plan(seed, solo))

export async function shrink(r: Run): Promise<Run> {
  const kind = r.failure!.kind
  const fails = async (steps: Step[]) => {
    const out = await replay({...r.plan, steps})
    return out.failure?.kind === kind ? out : undefined
  }
  const cut = Number.isFinite(r.failure!.step) ? r.plan.steps.slice(0, r.failure!.step + 1) : r.plan.steps
  let best = (await fails(cut)) ?? r
  for (let chunk = Math.ceil(best.plan.steps.length / 2); chunk >= 1; chunk = Math.floor(chunk / 2))
    for (let i = 0; i < best.plan.steps.length; ) {
      const steps = best.plan.steps
      const out = await fails([...steps.slice(0, i), ...steps.slice(i + chunk)])
      if (out) best = out
      else i += chunk
    }
  return best
}

export function report(r: Run): string {
  const {seed, setup, steps} = r.plan
  const f = r.failure!
  const who = `${['A', 'B', 'C'].slice(0, setup.writers).join(' ')}${setup.raw ? ' + raw' : ''}`
  return [
    `chaos seed ${seed}${setup.solo ? ' (solo)' : ''}: ${f.kind} at step ${Number.isFinite(f.step) ? f.step : 'end'} · writers ${who} · ${setup.blocks} block(s) · ${steps.length} steps after shrinking`,
    `  ${f.detail}`,
    `  steps:`,
    ...r.log.map((l) => `  ${l}`),
    `  server: ${r.server}`,
  ].join('\n')
}
