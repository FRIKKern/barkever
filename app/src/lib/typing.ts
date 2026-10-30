export const TYPING_MS = 1_000

export function afterTyping(lastKey: () => number, run: () => void, now = Date.now): () => void {
  let later: ReturnType<typeof setTimeout> | undefined
  const wait = () => {
    const left = lastKey() + TYPING_MS - now()
    if (left > 0) later = setTimeout(wait, left)
    else run()
  }
  wait()
  return () => clearTimeout(later)
}
