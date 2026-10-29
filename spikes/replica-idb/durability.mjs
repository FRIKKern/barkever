import {browser, picks, run} from './harness.mjs'
import {getDoc, mutate} from './bp.mjs'

const block = (ctx) => ctx.route('**/bp/**', (r) => r.abort())
const timed = async (s, fn) => {
  const t = performance.now()
  const r = await s.page.evaluate(fn)
  return {...r, wallMs: Math.round(performance.now() - t)}
}

async function offlineEdits(s, ids) {
  await s.ctx.setOffline(true)
  const expected = {}
  for (const id of ids) {
    await s.open(id)
    await s.typeAtEnd('#title', ' (offline edit)')
    await s.typeAtEnd('#body', '\nTyped offline.')
    expected[id] = await s.page.inputValue('#title')
  }
  await s.page.waitForTimeout(300)
  return expected
}

async function check(s, expected) {
  const titles = {}
  for (const id of Object.keys(expected)) titles[id] = (await s.open(id)) === expected[id]
  return {outbox: await s.outbox(), titles, lastBody: (await s.page.inputValue('#body')).endsWith('Typed offline.')}
}

async function conflicts(s, [a, b]) {
  for (const [id, set] of [[a, null], [b, {title: 'Their title'}]]) {
    const doc = await getDoc('note', id)
    const theirs = set ?? {body: {blocks: [...doc.body.blocks, {id: `${id}-srv`, type: 'paragraph', content: [{type: 'text', value: 'Written on another device.'}]}]}}
    const r = await mutate([{patch: {id, type: 'note', set: theirs, ifRevisionID: doc._rev}}])
    if (r.status !== 200) throw new Error(`server edit ${r.status}`)
  }
  for (const id of [a, b]) await s.open(id), await s.typeAtEnd('#title', ' (mine)')
  await s.page.waitForTimeout(300)
  const sync = await timed(s, () => window.__spike.sync())
  const [da, db] = [await getDoc('note', a), await getDoc('note', b)]
  await s.open(b)
  return {
    sync,
    otherField: {mineKept: da.title.endsWith(' (mine)'), theirsKept: JSON.stringify(da.body).includes('Written on another device.')},
    sameField: {serverKeptTheirs: db.title === 'Their title', outbox: await s.outbox(), shown: (await s.page.locator('#conflict').count()) === 1},
  }
}

async function durability(n, port) {
  const s = await browser(n, port)
  await s.launch()
  const R = {upload: await timed(s, () => window.__spike.upload())}
  if (R.upload.error) throw new Error(R.upload.error)
  const ids = await s.page.evaluate(() => window.__spike.ids())
  const expected = await offlineEdits(s, picks(ids, 3))
  R.whileOffline = {outbox: await s.outbox(), sync: (await s.page.evaluate(() => window.__spike.sync())).error}

  await block(s.ctx)
  await s.ctx.setOffline(false)
  await s.page.reload()
  await s.loaded()
  R.afterReload = await check(s, expected)
  await s.ctx.close()
  await s.launch(block)
  R.afterRestart = await check(s, expected)

  await s.ctx.unroute('**/bp/**')
  R.replay = await timed(s, () => window.__spike.sync())
  R.replay.outboxAfter = await s.outbox()
  R.onServer = {}
  for (const id of Object.keys(expected)) {
    const doc = await getDoc('note', id)
    R.onServer[id] = doc.title === expected[id] && JSON.stringify(doc.body).includes('Typed offline.')
  }

  const k = Math.min(n, 500)
  await s.ctx.setOffline(true)
  await s.page.evaluate(([ids, suffix]) => window.__spike.editMany(ids, suffix), [ids.slice(0, k), ' ·bulk'])
  await s.page.waitForFunction((k) => window.__spike.outboxSize().then((c) => c >= k), k)
  await s.ctx.setOffline(false)
  R.bulkReplay = {k, ...(await timed(s, () => window.__spike.sync())), outboxAfter: await s.outbox()}

  if (n === 50) R.conflicts = await conflicts(s, [ids[10], ids[11]])
  await s.ctx.close()
  return R
}

await run(5179, durability)
