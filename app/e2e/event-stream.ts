export async function untilWelcome(url: string, cookie: string): Promise<string> {
  const res = await fetch(url, {headers: {cookie: `bk_session=${cookie}`}, signal: AbortSignal.timeout(10_000)})
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (!text.includes('event: welcome')) {
    const {done, value} = await reader.read()
    if (done) throw new Error(`the stream ended after ${text.length} characters without a welcome`)
    text += value
  }
  await reader.cancel()
  return text
}
