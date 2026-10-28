// Test 6: does <bp-paper-canvas> load and save note.body? Real run, headless Chrome.
// The page loads the canvas from the Barkpark server (GET /v1/embed/canvas names the files),
// is seeded with note n5's body.blocks, a real keyboard types into it, and every
// `bp-canvas-ops` batch is saved to POST …/note/n5/fields/body/ops fenced on _rev — the same
// recipe as barkpark-studio app/src/components/PortableDocEditor.tsx + lib/blocks.ts.
// The token stays in Node: the page calls an exposed function, never sees it.
//
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> node 05-canvas.mjs [screenshot.png]
import {bp, getDoc, ORIGIN, DS} from './lib.mjs'

const pw = process.env.PLAYWRIGHT_CORE ?? '../barkpark/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs'
const {chromium} = await import(pw)
const shot = process.argv[2]
const ID = 'n5'

const files = await (await fetch(`${ORIGIN}/v1/embed/canvas`)).json()
const schema = (await bp('GET', `/v1/schemas/${DS}/note`)).body.schema
const vocab = schema.fields.find((f) => f.name === 'body').blocks
const start = (await getDoc('note', ID)).body.result
let rev = start._rev
console.log('files', JSON.stringify(files))
console.log('start: _id', start._id, 'blocks', JSON.stringify(start.body.blocks))

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true})
const page = await browser.newPage()
const log = []
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`))

// The exact host recipe: ops out → one fenced write → server blocks back in as the canvas's own echo.
const saves = []
await page.exposeFunction('saveOps', async (ops) => {
  const r = await bp('POST', `/v1/data/doc/${DS}/note/${ID}/fields/body/ops`, {ops, ifRev: rev})
  saves.push({status: r.status, ms: r.ms, ops: ops.map((o) => o.op)})
  if (r.status !== 200) return {ok: false, status: r.status, error: r.body?.error?.message}
  rev = r.body.result.rev
  return {ok: true, blocks: r.body.result.blocks}
})

await page.route('http://barkever.test/**', (route) => route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><body style="padding:24px;font:16px system-ui"><h1>note n5</h1><div id=host></div></body>'}))
await page.goto('http://barkever.test/')
const mounted = await page.evaluate(async ({origin, files, blocks, vocab}) => {
  window.BP_PAPER_EDITOR_NO_INJECT = true
  for (const href of files.styles) document.head.append(Object.assign(document.createElement('link'), {rel: 'stylesheet', href: origin + href}))
  await new Promise((ok, no) => document.head.append(Object.assign(document.createElement('script'), {src: origin + files.script, onload: ok, onerror: no})))
  await customElements.whenDefined('bp-paper-canvas')
  const el = document.createElement('bp-paper-canvas')
  el.acknowledgedSaves = true
  el.blocks = blocks
  el.setAttribute('editable', 'true')
  el.setAttribute('data-vocabulary', JSON.stringify(vocab))
  el.setAttribute('block-cards', '')
  window.__batches = 0
  el.addEventListener('bp-canvas-ops', async (e) => {
    const {ops, seq} = e.detail
    const requestId = `http-${seq}`
    el.identifyOpsRequest(seq, requestId)
    const r = await window.saveOps(ops)
    if (r.ok) (el.applyServerBlocks(r.blocks, {mode: 'own', requestId}), el.acknowledgeOps(seq, true))
    else el.discardInflightOps(seq, {reason: r.error})
    window.__batches++
  })
  document.getElementById('host').append(el)
  await new Promise((r) => setTimeout(r, 500))
  return {
    contract: customElements.get('bp-paper-editor')?.CONTRACT_VERSION ?? null,
    pm: !!el.querySelector('.ProseMirror'),
    text: el.innerText.slice(0, 200),
  }
}, {origin: ORIGIN, files, blocks: start.body.blocks, vocab})
console.log('mounted', JSON.stringify(mounted))

// Type at the end of the first paragraph, then a new paragraph.
const para = page.locator('bp-paper-canvas .ProseMirror p').first()
await para.click()
await page.keyboard.press('End')
await page.keyboard.type(' Typed in the canvas.')
await page.keyboard.press('Enter')
await page.keyboard.type('Second paragraph from Enter.')
await page.waitForFunction(() => window.__batches > 0, null, {timeout: 10000})
await page.waitForTimeout(1500) // let the debounce flush the rest
console.log('pending after wait', await page.evaluate(() => document.querySelector('bp-paper-canvas').hasPendingChanges()))
if (shot) await page.screenshot({path: shot, fullPage: true})
await browser.close()

const end = (await getDoc('note', ID)).body.result
console.log('saves', JSON.stringify(saves))
console.log('end: _id', end._id, 'blocks', JSON.stringify(end.body.blocks))
const all = JSON.stringify(end.body.blocks)
console.log('RESULT round trip:', all.includes('Typed in the canvas.') && all.includes('Second paragraph from Enter.') ? 'PASS' : 'FAIL')
console.log('console:', log.filter((l) => !l.startsWith('[debug]')).slice(0, 15).join('\n  '))
