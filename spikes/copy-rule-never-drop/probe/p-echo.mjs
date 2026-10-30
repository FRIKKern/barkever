import {browser, device, newNote, typeAtEndOf, leave, saved, synced, serverNote, summary, sleep} from './lib.mjs'
const b = await browser()
const A = await device(b)
const out = []
for (const latency of [0, 400, 1200]) {
  const id = await newNote(A, `Echo ${latency} ${Date.now()}`, 'Start.')
  const cdp = await A.context().newCDPSession(A)
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency, downloadThroughput: -1, uploadThroughput: -1})
  await typeAtEndOf(A, 0, ' ' + 'quick brown fox '.repeat(8), {delay: 25})
  const t = A.getByTestId('title'); await t.focus(); await t.press('End'); await A.keyboard.type(' titled'.repeat(6), {delay: 25})
  await typeAtEndOf(A, 0, ' end.')
  await leave(A)
  await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1})
  await saved(A); await synced(A); await sleep(1500); await synced(A)
  const n = await serverNote(id)
  out.push({latency, copies: n.conflicts?.length ?? 0, pEndsRight: summary(n).p[0].endsWith('fox  end.') || summary(n).p[0].endsWith('fox end.'), titleEnds: n.title.endsWith('titled titled'), conflictUi: await A.getByTestId('conflict').count()})
}
console.log(JSON.stringify(out), JSON.stringify(A.errors))
await b.close()
