import {browser, device, newNote, typeAtEndOf, leave, synced, serverNote, everything, sleep, bp, DS, deviceOf} from './lib.mjs'
const lanes = (cs = []) => new Set(cs.map((c) => `${c.by}|${[...c.clash].sort()}`)).size
const shownIn = (page) => page.getByTestId('conflict-lane').count()
const report = async (label, id, pages, extra = {}) => {
  const n = await serverNote(id)
  const r = {label, stored: n.conflicts?.length ?? 0, shownOnServer: lanes(n.conflicts), shownInView: await Promise.all(pages.map(shownIn)), bytes: JSON.stringify(n).length, ...extra}
  console.log(JSON.stringify(r))
  return n
}
const b = await browser()
const A = await device(b), B = await device(b)

{
  const id = await newNote(A, `Two typists 5 s ${Date.now()}`, 'Shared.')
  await leave(A); await synced(A)
  await B.goto(`/?n=${id}`)
  await B.getByTestId('canvas').getByText('Shared.').waitFor()
  await typeAtEndOf(A, 0, ''); await typeAtEndOf(B, 0, '')
  const typist = async (p, w) => { const end = Date.now() + 5000; let i = 0; while (Date.now() < end) await p.keyboard.type(` ${w}${i++}`, {delay: 60}); return i - 1 }
  const [la, lb] = await Promise.all([typist(A, 'a'), typist(B, 'b')])
  await Promise.all([leave(A), leave(B)]); await Promise.all([synced(A), synced(B)]); await sleep(2000); await Promise.all([synced(A), synced(B)])
  const n = await report('two devices, one block, 5 s online', id, [A, B], {lastA: `a${la}`, lastB: `b${lb}`})
  const devices = [await deviceOf(A), await deviceOf(B)]
  console.log(JSON.stringify({bothLastSurvive: everything(n).includes(`a${la}`) && everything(n).includes(`b${lb}`), byOwnDevices: (n.conflicts ?? []).every((c) => devices.includes(c.by))}))
}

{
  const id = await newNote(A, `Title race ${Date.now()}`, 'Body.')
  const title = A.getByTestId('title')
  await title.focus(); await title.press('End')
  const typing = title.pressSequentially(' L' + 'abcdefghijklmnopqrstuvwxyz'.repeat(2), {delay: 60})
  for (let i = 1; i <= 6; i++) {
    await sleep(400)
    const r = await bp(`/v1/data/mutate/${DS}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', set: {title: `Remote title ${i}`}}}]})})
    if (!r.ok) throw new Error(`raw ${r.status}`)
  }
  await typing; await leave(A); await synced(A); await sleep(1500); await synced(A)
  const n = await report('raw writer sets the title 6 times while I type it', id, [A])
  console.log(JSON.stringify({remoteTitlesKept: (n.conflicts ?? []).map((c) => c.title), mainTitleEnds: n.title.slice(-6)}))
}

{
  const id = await newNote(A, `Fast typing ${Date.now()}`, 'Start.')
  await B.goto(`/?n=${id}`)
  await typeAtEndOf(A, 0, ' ' + 'the quick brown fox jumps over the lazy dog '.repeat(10), {delay: 10})
  const t = A.getByTestId('title'); await t.focus(); await t.press('End'); await A.keyboard.type(' fast'.repeat(30), {delay: 10})
  await typeAtEndOf(A, 0, ' end.', {delay: 10})
  await leave(A); await synced(A); await sleep(1500); await synced(A); await synced(B)
  await report('own fast typing (one device, another watching)', id, [A, B])
}
console.log(JSON.stringify({errors: [...A.errors, ...B.errors]}))
await b.close()
