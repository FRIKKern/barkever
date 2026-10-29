import { execFileSync } from 'node:child_process'
import { mutate } from './bp.mjs'
import { PROFILE, boot, drain, launch, net, openRow, serverDoc, typeAtEnd } from './lib.mjs'

const has = (page, id, word) => page.evaluate(([id, w]) => !!__spike.notes.get(id)?.text.includes(w), [id, word])
const outbox = (page) => page.evaluate(async () => (await __spike.executor.peekOutbox()).length)

export async function offline({ ctx, page }, log) {
  await net(false)
  await ctx.setOffline(true)
  const edited = []
  for (let k = 0; k < 5; k++) {
    const id = await openRow(page, 10 + k)
    const mark = `offline-e-${k}-${Date.now().toString(36)}`
    await typeAtEnd(page, '#body', ` ${mark}`, 20)
    edited.push({ id, mark })
  }
  await page.waitForTimeout(700)
  const before = await outbox(page)
  await ctx.setOffline(false)
  await boot(page, true)
  const visible = () => Promise.all(edited.map((e) => has(page, e.id, e.mark))).then((xs) => xs.filter(Boolean).length)
  const visibleAtFirstList = await visible()
  const allVisibleMsAfterFirstList = await page.evaluate(async (edited) => {
    const all = () => edited.every((e) => __spike.notes.get(e.id)?.text.includes(e.mark))
    const t0 = performance.now()
    while (!all() && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 1))
    return all() ? Math.round(performance.now() - __spike.marks.firstListFrame) : 'never'
  }, edited)
  const durable = await page.evaluate(() => __spike.notes.utils.exportData())
  log('reloadPersistence', {
    edits: edited.length,
    outboxBefore: before,
    outboxAfter: await outbox(page),
    visibleAtFirstList,
    allVisibleMsAfterFirstList,
    visibleAfter: await visible(),
    inNotesStore: edited.filter((e) => durable.find((d) => d._id === e.id)?.text.includes(e.mark)).length,
  })

  const crashId = await openRow(page, 20)
  await typeAtEnd(page, '#body', ' crash-window', 10)
  await boot(page, true)
  await page.waitForTimeout(300)
  const reloadKept = await has(page, crashId, 'crash-window')
  const killId = await openRow(page, 21)
  const word = 'killwindow'
  await typeAtEnd(page, '#body', ` ${word}`, 10)
  execFileSync('pkill', ['-9', '-f', PROFILE])
  await ctx.close().catch(() => {})
  ;({ ctx, page } = await launch())
  await boot(page)
  await page.waitForTimeout(300)
  const text = await page.evaluate((id) => __spike.notes.get(id).text, killId)
  const survived = [...word].findLastIndex((_, i) => text.includes(` ${word.slice(0, i + 1)}`)) + 1
  log('crashWindow', { reloadRightAfterTyping: reloadKept ? 'kept' : 'lost', sigkillRightAfterTyping: `${survived}/${word.length} chars kept`, outbox: await outbox(page) })

  const calls0 = (await net(true)).mutateCalls
  const replay = await drain(page)
  const calls1 = (await net(true)).mutateCalls
  const server = []
  for (const e of edited) {
    const doc = await serverDoc(e.id)
    const rev = await page.evaluate((id) => __spike.notes.get(id)._rev, e.id)
    server.push({ id: e.id, hasEdit: JSON.stringify(doc.body).includes(e.mark), revMatches: doc._rev === rev })
  }
  log('replay', { ...replay, mutateCalls: calls1 - calls0, allOnServer: server.every((s) => s.hasEdit && s.revMatches), server })

  const cid = await openRow(page, 30)
  await net(false)
  await typeAtEnd(page, '#body', ' mine-offline', 10)
  await page.waitForTimeout(600)
  await mutate([{ patch: { id: cid, type: 'note', set: { title: 'Changed elsewhere' } } }])
  await net(true)
  const c = await drain(page)
  const doc = await serverDoc(cid)
  log('conflict', { conflicts412: c.conflicts412, serverTitle: doc.title, bodyHasMine: JSON.stringify(doc.body).includes('mine-offline') })
  await ctx.close()
}
