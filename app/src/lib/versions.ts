import type {Conflict} from './model.ts'

export type Group = {latest: Conflict; earlier: Conflict[]}

type Lane = {by?: string; parts: Set<string>; copies: Conflict[]}

const newest = (a: Conflict, b: Conflict) => b.at.localeCompare(a.at) || b._key.localeCompare(a._key)

export function groups(all: Conflict[]): Group[] {
  const lanes: Lane[] = []
  for (const c of [...all].sort(newest)) {
    const [into, ...more] = lanes.filter((l) => l.by === c.by && c.clash.some((p) => l.parts.has(p)))
    const lane = into ?? {by: c.by, parts: new Set<string>(), copies: []}
    if (!into) lanes.push(lane)
    for (const l of more) {
      lane.copies.push(...l.copies)
      l.parts.forEach((p) => lane.parts.add(p))
      lanes.splice(lanes.indexOf(l), 1)
    }
    lane.copies.push(c)
    c.clash.forEach((p) => lane.parts.add(p))
  }
  return lanes.map((l) => l.copies.sort(newest)).map(([latest, ...earlier]) => ({latest, earlier}))
}
