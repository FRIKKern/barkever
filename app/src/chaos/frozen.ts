export function frozen<T>(v: T): T {
  if (!v || typeof v !== 'object' || Object.isFrozen(v)) return v
  const out = Array.isArray(v) ? v.map(frozen) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, frozen(x)]))
  return Object.freeze(out) as T
}
