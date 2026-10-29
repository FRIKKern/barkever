export const SETTLE_MS = 60_000

export type Kept = {cursor: number | null; seen: number[]}

export function keeper(kept: Kept, clock: () => number) {
  const seen = new Set(kept.seen)
  const marks: {at: number; id: number}[] = []
  let cursor = kept.cursor
  let top = -Infinity
  let stoppedAt: number | undefined
  const now = () => stoppedAt ?? clock()

  const settle = () => {
    const cut = now() - SETTLE_MS
    let n = 0
    for (; n < marks.length && marks[n].at <= cut; n++) cursor = Math.max(cursor ?? -Infinity, marks[n].id)
    marks.splice(0, n)
    if (stoppedAt !== undefined) marks.length = 0
    if (cursor !== null) for (const id of seen) if (id <= cursor) seen.delete(id)
  }

  return {
    since: kept.cursor,
    seen: (id: number) => seen.has(id),
    saw(id: number) {
      seen.add(id)
      if (stoppedAt !== undefined || id <= top) return
      top = id
      marks.push({at: now(), id})
    },
    stop() {
      stoppedAt ??= clock()
    },
    keep(): Kept & {due: number | undefined} {
      settle()
      return {cursor, seen: [...seen], due: marks.length ? marks[0].at + SETTLE_MS - now() : undefined}
    },
  }
}
