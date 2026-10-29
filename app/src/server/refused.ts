const RETRYABLE = new Set([401, 403, 408, 429])

export const refusedForGood = (status: number) => status >= 400 && status < 500 && !RETRYABLE.has(status)
