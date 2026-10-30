const ROOT = process.argv[4]
const {sign} = await import(ROOT + '/app/src/replica/sign.ts')
const {groups} = await import(ROOT + '/app/src/lib/versions.ts').catch(() => ({groups: (cs: any[]) => cs}))
const {blockText} = await import(ROOT + '/app/src/lib/model.ts')
type Block = any
type Note = any

const rule = ROOT + '/app/src/replica/merge.ts'
const minutes = Number(process.argv[3] ?? 10)
const forget = process.argv.includes('--forget')
const {mergeLocal, mergeNote, sameContent} = await import(rule)

const T0 = Date.parse('2026-10-29T12:00:00.000Z')
const STEP = 50
const KEY_P = 0.15
const PUSH_EVERY = 400
const PULL_EVERY = 250

let seed = 1010
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const r0: Note = {_id: 'n', _type: 'note', _rev: 'r0', title: 'Storm', tags: [], links: [], body: {blocks: [p('a', 'Shared'), p('b', 'A own'), p('c', 'B own')]}}

let server = r0
let revs = 0
let t = 0
const at = () => new Date(T0 + t).toISOString()
const devices = ['A', 'B'].map((id, i) => ({id, own: i ? 'c' : 'b', phase: i * 200, local: r0, base: r0, saves: 0}))
type Device = (typeof devices)[number]

function type(d: Device) {
  const r = rand()
  const where = r < 0.8 ? 'a' : r < 0.9 ? d.own : 'title'
  const ch = d.id.toLowerCase()
  const after = where === 'title' ? {title: `${d.local.title}${ch}`} : {body: {blocks: d.local.body!.blocks.map((b) => (b.id === where ? p(b.id, `${blockText(b)}${ch}`) : b))}}
  const shown = where === 'title' ? {title: d.local.title} : {body: d.local.body}
  d.local = mergeLocal(d.local, shown, after, at(), `local-${d.id}-${++d.saves}`, d.id, d.base)
}

function pull(d: Device) {
  if (server._rev === d.base._rev) return
  d.local = sameContent(d.local, d.base) ? {...server, _typed: forget ? undefined : d.local._typed} : mergeNote(d.base, d.local, server, at(), d.id)
  d.base = server
}

function push(d: Device) {
  if (sameContent(d.local, d.base)) return
  pull(d)
  const {_typed, ...sent} = d.local
  server = d.base = {...sign(sent, d.id), _rev: `r${++revs}`}
  d.local = {...server, _typed: forget ? undefined : _typed}
}

const samples: {minute: number; stored: number; shown: number; bytes: number; cpuMs: number}[] = []
let clock = performance.now()
for (; t <= minutes * 60_000; t += STEP) {
  for (const d of devices) {
    if (rand() < KEY_P) type(d)
    if ((t + d.phase) % PUSH_EVERY === 0) push(d)
    if ((t + d.phase) % PULL_EVERY === 0) pull(d)
  }
  if (t % 60_000 === 0) samples.push({minute: t / 60_000, stored: server.conflicts?.length ?? 0, shown: groups(server.conflicts ?? []).length, bytes: JSON.stringify(server).length, cpuMs: Math.round(-clock + (clock = performance.now()))})
}
devices.forEach(push)
devices.forEach(pull)
const final = {rule, minutes, revs, stored: server.conflicts?.length ?? 0, shown: groups(server.conflicts ?? []).length, bytes: JSON.stringify(server).length, startBytes: JSON.stringify(r0).length}
console.log(JSON.stringify({final, samples}))
