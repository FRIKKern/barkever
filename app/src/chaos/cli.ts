import {report, run, shrink, type Run} from './chaos.ts'

const [count = 50_000, from = 1] = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const solo = process.argv.includes('--solo')
const started = performance.now()
const failed = new Map<string, Run[]>()
let copies = 0

for (let seed = from; seed < from + count; seed++) {
  const r = await run(seed, solo)
  copies += r.copies
  if (r.failure) failed.set(r.failure.kind, [...(failed.get(r.failure.kind) ?? []), r])
  if ((seed - from + 1) % 5000 === 0) console.log(`  ${seed - from + 1} seeds, ${[...failed.values()].flat().length} failing`)
}

const ms = performance.now() - started
console.log(`chaos: ${count} ${solo ? 'solo ' : ''}seeds from ${from} in ${(ms / 1000).toFixed(1)} s (${((ms / count) * 1000).toFixed(0)} ms per 1,000), copies per note ${(copies / count).toFixed(2)}`)
for (const [kind, runs] of failed) {
  console.log(`\n${kind}: ${runs.length} seeds (${runs.slice(0, 20).map((r) => r.plan.seed).join(', ')}${runs.length > 20 ? ', …' : ''})`)
  console.log(report(await shrink(runs[0])))
}
process.exitCode = failed.size ? 1 : 0
