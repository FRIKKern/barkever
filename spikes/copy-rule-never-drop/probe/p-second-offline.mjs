import {browser, device, newNote, typeAtEndOf, leave, saved, synced, serverNote, everything, summary, sleep, until} from './lib.mjs'
const b = await browser()
const A = await device(b), B = await device(b)
const id = await newNote(A, `Two offline hours ${Date.now()}`, 'Base.')
await leave(A); await synced(A)
await B.goto(`/?n=${id}`)
await until(async () => (await B.getByTestId('canvas').textContent())?.includes('Base.'))
const hour = async (a, bb) => {
  await Promise.all([A.context().setOffline(true), B.context().setOffline(true)])
  await typeAtEndOf(A, 0, a); await leave(A); await saved(A)
  await typeAtEndOf(B, 0, bb); await leave(B); await saved(B)
  await A.context().setOffline(false); await synced(A); await sleep(1000)
  await B.context().setOffline(false); await synced(B); await sleep(2000); await synced(A); await synced(B)
  const n = await serverNote(id)
  console.log(`after hour (${a.trim()} / ${bb.trim()}):`, JSON.stringify(summary(n)))
  return n
}
await hour(' A1.', ' B1.')
await A.locator('main.editor').screenshot({path: 'offline2-1-A.png'})
const n = await hour(' a2.', ' b2.')
await A.locator('main.editor').screenshot({path: 'offline2-2-A.png'})
console.log(JSON.stringify({id, A1survives: everything(n).includes('A1.'), errors: [...A.errors, ...B.errors]}))
await b.close()
