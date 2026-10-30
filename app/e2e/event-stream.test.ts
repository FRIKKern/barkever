import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {untilWelcome} from './event-stream.ts'

async function stream(frames: string[], end: boolean) {
  const seen: string[] = []
  const server = createServer((req, res) => {
    seen.push(String(req.headers.cookie))
    res.writeHead(200, {'content-type': 'text/event-stream'})
    for (const f of frames) res.write(f)
    if (end) res.end()
  })
  await new Promise<void>((r) => server.listen(0, r))
  return {url: `http://localhost:${(server.address() as AddressInfo).port}/api/listen`, seen, close: () => (server.closeAllConnections(), server.close())}
}

test('the stream is read up to and including its welcome, with the session cookie', async () => {
  const s = await stream([': hello\n\n', 'event: welcome\ndata: {}\n\n'], false)
  const text = await untilWelcome(s.url, 'sealed-value').finally(s.close)
  assert.ok(text.includes(': hello') && text.includes('event: welcome'))
  assert.deepEqual(s.seen, ['bk_session=sealed-value'])
})

test('a stream that ends before its welcome is an error, not an empty read', async () => {
  const s = await stream([': hello\n\n', 'event: mutation\ndata: {}\n\n'], true)
  await assert.rejects(untilWelcome(s.url, 'sealed-value').finally(s.close), /ended after \d+ characters without a welcome/)
})
