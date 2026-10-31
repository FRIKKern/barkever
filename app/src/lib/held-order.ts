type Row = {id: string}

export function inHeldOrder<T extends Row>(held: T[], now: T[]): T[] {
  const fresh = new Map(now.map((n) => [n.id, n]))
  const kept = new Set(held.map((n) => n.id))
  return [...held.map((n) => fresh.get(n.id) ?? n), ...now.filter((n) => !kept.has(n.id))]
}
