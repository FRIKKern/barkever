const REFUSED = new Set([400, 413, 422])

export const refusedForGood = (status: number) => REFUSED.has(status)
