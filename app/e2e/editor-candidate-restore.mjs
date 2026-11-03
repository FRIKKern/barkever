import assert from 'node:assert/strict'
import {execFileSync, spawn} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, expect} from '@playwright/test'

const required = (name) =>
  process.env[name] ||
  (() => {
    throw new Error(`${name} is required`)
  })()
const candidateTgz = path.resolve(required('BARKEVER_EDITOR_CANDIDATE_TGZ'))
const candidateSha256 = required('BARKEVER_EDITOR_CANDIDATE_SHA256')
const baselineDir = path.resolve(required('BARKEVER_EDITOR_BASELINE_DIR'))
const baselineContract = required('BARKEVER_EDITOR_BASELINE_CONTRACT')
const baselineId = required('BARKEVER_EDITOR_BASELINE_ID')
const evidenceDir = path.resolve(required('BARKEVER_EDITOR_RESTORE_EVIDENCE'))
const appDir = fileURLToPath(new URL('../', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const vite = path.join(appDir, 'node_modules/vite/bin/vite.js')
const output = 'dist/r26-editor-restore'
const files = ['bp-paper-code.js', 'bp-paper-editor-shell.css', 'bp-paper-editor.bundle.js', 'bp-paper-editor.css', 'bp-paper-mermaid.js', 'bp-paper-surface.css']
const executable = ['bp-paper-editor.bundle.js', 'bp-paper-editor.css', 'bp-paper-editor-shell.css', 'bp-paper-surface.css']
const bundleName = executable[0]
const styleNames = executable.slice(1)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const tarball = await readFile(candidateTgz)
assert.equal(sha256(tarball), candidateSha256, 'candidate tarball differs from its hosted digest')

let unpacked
let backend
let preview
let browser
try {
  unpacked = await mkdtemp(path.join(tmpdir(), 'barkever-editor-candidate-'))
  execFileSync('tar', ['-xzf', '-', '-C', unpacked], {input: tarball})
  const candidateRoot = path.join(unpacked, 'package')
  const candidateManifest = JSON.parse(await readFile(path.join(candidateRoot, 'package.json'), 'utf8'))
  const candidateContract = candidateManifest.barkpark?.contractVersion
  assert.match(candidateContract, /^\d+\.\d+\.\d+$/)

  async function loadAssetSet(name, contract, dir) {
    const assets = Object.fromEntries(
      await Promise.all(
        files.map(async (file) => {
          const bytes = await readFile(path.join(dir, file))
          const hash = sha256(bytes)
          return [file, {bytes, hash, path: `/assets/v/${hash.slice(0, 16)}/${file}`}]
        }),
      ),
    )
    return {name, contract, dir, assets}
  }

  const phases = [await loadAssetSet('candidate', candidateContract, path.join(candidateRoot, 'dist')), await loadAssetSet('restored-baseline', baselineContract, baselineDir)]
  assert.notEqual(phases[0].assets[bundleName].hash, phases[1].assets[bundleName].hash, 'candidate and baseline executable must differ')

  let active = phases[0]
  let revision = 1
  let bodyText = 'Candidate restore fixture'
  let document = () => ({
    _id: 'note-01',
    _type: 'note',
    _rev: `rev-${revision}`,
    _updatedAt: '2026-11-03T00:00:00Z',
    title: 'Candidate restore fixture',
    notebook: {_type: 'reference', _ref: 'notebook-01'},
    tags: [],
    links: [],
    body: {
      blocks: [
        {
          id: 'paragraph-01',
          type: 'paragraph',
          content: [{type: 'text', value: bodyText}],
        },
      ],
    },
  })
  const notebook = {
    _id: 'notebook-01',
    _type: 'notebook',
    _rev: 'notebook-rev-1',
    name: 'Fixture notebook',
  }
  const reads = []
  const receipts = []
  const servedNotes = []
  let backendError
  let rejectBackendFailure
  const backendFailure = new Promise((_, reject) => {
    rejectBackendFailure = reject
  })
  backendFailure.catch(() => {})

  const handleRequest = async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const pathname = url.pathname
    reads.push([request.method, pathname])
    const reply = (status, body) => {
      response.writeHead(status, {'content-type': 'application/json'})
      response.end(JSON.stringify(body))
    }
    if (pathname === '/v1/embed/canvas')
      return reply(200, {
        script: active.assets[bundleName].path,
        styles: styleNames.map((name) => active.assets[name].path),
      })
    const asset = Object.entries(active.assets).find(([, value]) => value.path === pathname)
    if (asset) {
      response.writeHead(200, {
        'content-type': asset[0].endsWith('.css') ? 'text/css' : 'text/javascript',
        'cache-control': 'public, max-age=31536000, immutable',
      })
      response.end(asset[1].bytes)
      return
    }
    if (pathname === '/v1/auth/login' && request.method === 'POST')
      return reply(201, {
        token: 'synthetic-session',
        user: {email: 'editor@example.invalid'},
      })
    if (pathname === '/v1/auth/me') return reply(200, {user: {email: 'editor@example.invalid'}})
    if (/\/v1\/prefs\/[^/]+\//.test(pathname)) return reply(200, {value: {v: 1, ids: []}})
    if (pathname.endsWith('/v1/data/listen/r26-editor-restore')) {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
      })
      response.write('event: welcome\ndata: {}\n\n')
      return
    }
    if (pathname.includes('/v1/data/query/r26-editor-restore/')) {
      const type = pathname.endsWith('/note') ? 'note' : 'notebook'
      const documents = type === 'note' ? [document()] : [notebook]
      if (type === 'note')
        servedNotes.push({
          method: request.method,
          pathname,
          document: documents[0],
        })
      return reply(200, {
        result: {documents, hasMore: false, total: documents.length},
      })
    }
    if (pathname.endsWith('/v1/data/mutate/r26-editor-restore') && request.method === 'POST') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks))
      const mutation = payload.mutations?.[0]
      const blocks = mutation?.patch?.set?.body?.blocks
      const expectedRevision = `rev-${revision}`
      assert.equal(payload.mutations?.length, 1)
      assert.equal(mutation?.patch?.id, 'note-01')
      assert.equal(mutation?.patch?.ifRevisionID, expectedRevision)
      assert.ok(Array.isArray(blocks))
      bodyText = blocks[0].content.map((part) => part.value ?? part.text ?? '').join('')
      revision++
      const saved = document()
      receipts.push({expectedRevision, payload, document: saved})
      return reply(200, {results: [{document: saved}]})
    }
    return reply(404, {error: {code: 'fixture_not_found'}})
  }
  backend = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      if (!backendError) {
        backendError = error
        rejectBackendFailure(error)
      }
      if (!response.headersSent) response.writeHead(500, {'content-type': 'application/json'})
      if (!response.writableEnded) response.end(JSON.stringify({error: {code: 'fixture_failed'}}))
    })
  })
  await new Promise((resolve, reject) => {
    backend.once('error', reject)
    backend.listen(0, '127.0.0.1', resolve)
  })

  const env = {
    ...process.env,
    BARKPARK_URL: `http://127.0.0.1:${backend.address().port}`,
    BARKPARK_WORKSPACE: 'barkever',
    BARKPARK_PROJECT: 'default',
    BARKPARK_DATASET: 'r26-editor-restore',
    BARKEVER_SESSION_SECRET: randomBytes(32).toString('base64url'),
  }
  for (const key of ['BARKPARK_TOKEN', 'BARKEVER_SHARED_TOKEN']) env[key] = ''
  execFileSync('pnpm', ['build', '--outDir', output], {
    cwd: appDir,
    env,
    stdio: 'inherit',
  })
  preview = spawn(process.execPath, [vite, 'preview', '--outDir', output, '--host', '127.0.0.1', '--port', '0'], {cwd: appDir, env, stdio: 'pipe'})
  let previewLog = ''
  let previewError
  let origin
  preview.on('error', (error) => {
    previewError = error
  })
  preview.stdout.on('data', (data) => {
    previewLog += data
    origin ||= previewLog.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
  })
  preview.stderr.on('data', (data) => {
    previewLog += data
  })
  await expect
    .poll(
      () => {
        assert.ifError(previewError)
        assert.equal(preview.exitCode, null, `Preview stopped: ${previewLog}`)
        return origin
      },
      {timeout: 20_000},
    )
    .toMatch(/^http:/)

  const runJourney = async () => {
    browser = await chromium.launch({channel: 'chrome'})
    const evidence = []
    for (const [index, phase] of phases.entries()) {
      active = phase
      reads.length = 0
      let editContext
      let reloadContext
      try {
        editContext = await browser.newContext()
        const page = await editContext.newPage()
        const loaded = new Map()
        page.on('response', (response) => {
          const url = new URL(response.url())
          if (url.origin !== origin || !url.pathname.startsWith('/editor-assets/')) return
          const pathname = url.pathname.replace(/^\/editor-assets/, '/assets')
          if (executable.some((name) => phase.assets[name].path === pathname)) loaded.set(pathname, response)
        })
        await page.goto(`${origin}/sign-in?redirect=${encodeURIComponent('/?n=note-01')}`)
        await page.getByLabel('Email', {exact: true}).fill('editor@example.invalid')
        await page.getByLabel('Password', {exact: true}).fill('synthetic-password')
        await page.getByRole('button', {name: 'Sign in', exact: true}).click()
        await expect(page).toHaveURL(`${origin}/?n=note-01`)
        await expect(page.locator('bp-paper-canvas')).toBeVisible({
          timeout: 20_000,
        })
        await expect.poll(() => loaded.size).toBe(executable.length)

        const loader = {}
        for (const name of executable) {
          const asset = phase.assets[name]
          const response = loaded.get(asset.path)
          assert.equal(response.status(), 200)
          const hash = sha256(await response.body())
          assert.equal(hash, asset.hash, `${phase.name} Barkever loader response for ${name}`)
          loader[name] = {url: response.url(), sha256: hash}
        }
        const before = bodyText
        const suffix = index === 0 ? ' candidate' : ' restored'
        await page.locator('bp-paper-canvas').getByText(before, {exact: true}).click()
        await page.keyboard.press('End')
        await page.keyboard.insertText(suffix)
        const after = before + suffix
        await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
        await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
        assert.equal(receipts.length, index + 1)
        const receipt = receipts.at(-1)
        assert.equal(receipt.document._rev, `rev-${index + 2}`)
        assert.equal(receipt.document.body.blocks[0].content[0].value, after)

        const cookies = await editContext.cookies()
        assert.ok(cookies.some((cookie) => cookie.name === 'bk_session'))
        await editContext.close()
        editContext = undefined

        const reloadReadStart = reads.length
        const reloadNoteStart = servedNotes.length
        reloadContext = await browser.newContext({
          storageState: {cookies, origins: []},
        })
        const reload = await reloadContext.newPage()
        await reload.goto(`${origin}/?n=note-01`)
        await expect(reload.locator('bp-paper-canvas').getByText(after, {exact: true})).toBeVisible({timeout: 20_000})
        const freshReads = reads.slice(reloadReadStart)
        const freshNotes = servedNotes.slice(reloadNoteStart)
        assert.ok(freshReads.some(([method, pathname]) => method === 'GET' && pathname.endsWith('/v1/data/query/r26-editor-restore/note')))
        assert.ok(freshNotes.length > 0)
        const served = freshNotes.at(-1)
        assert.equal(served.method, 'GET')
        assert.equal(served.document._rev, receipt.document._rev)
        assert.equal(served.document.body.blocks[0].content[0].value, after)
        const contract = await reload.evaluate(() => customElements.get('bp-paper-editor')?.CONTRACT_VERSION)
        assert.equal(contract, phase.contract)
        assert.ok(reads.some(([method, pathname]) => method === 'GET' && pathname === '/v1/embed/canvas'))
        evidence.push({
          phase: phase.name,
          contract,
          declared: Object.fromEntries(files.map((name) => [name, phase.assets[name].hash])),
          loader,
          clientAcknowledgement: {saveStatus: 'Saved', syncStatus: 'Synced'},
          receipt,
          freshReload: {storageOrigins: [], served},
          restoredText: after,
          reads: [...reads],
        })
        console.log(`PASS ${phase.name} ${contract} ${loader[bundleName].sha256}`)
      } catch (error) {
        console.error(previewLog.slice(-3_000), reads)
        throw error
      } finally {
        await editContext?.close()
        await reloadContext?.close()
      }
    }
    await mkdir(evidenceDir, {recursive: true})
    await writeFile(
      path.join(evidenceDir, 'manifest.json'),
      JSON.stringify(
        {
          sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: repo,
            encoding: 'utf8',
          }).trim(),
          sourceDirty:
            execFileSync('git', ['status', '--porcelain', '--', '.', ':(exclude)app/node_modules', ':(exclude)app/dist'], {
              cwd: repo,
              encoding: 'utf8',
            }).trim() !== '',
          candidate: {
            path: candidateTgz,
            sha256: candidateSha256,
            contract: candidateContract,
          },
          baseline: {id: baselineId, contract: baselineContract},
          isolation: {
            loopbackOnly: true,
            liveMutation: false,
            backend: `http://127.0.0.1:${backend.address().port}`,
          },
          phases: evidence,
          assertions: [
            'the hosted candidate tarball matched its supplied SHA256 digest',
            'all six candidate and baseline browser assets were read and hashed before launch',
            'the built Barkever loader fetched the exact candidate executable and three styles through its editor-files and editor-assets routes',
            'the built Barkever loader then fetched the exact restored baseline executable and styles',
            'candidate and restored-baseline mutations each carried the exact prior revision and the client received the saved document acknowledgement',
            'a new browser context carrying only the auth cookie fetched the exact saved revision and text from the fixture backend for each phase',
            'production defaults, deployment pins and live notes were not changed',
          ],
        },
        null,
        2,
      ) + '\n',
    )
    console.log(`Evidence: ${path.join(evidenceDir, 'manifest.json')}`)
  }
  await Promise.race([runJourney(), backendFailure])
} finally {
  const cleanupErrors = []
  const cleanup = async (name, action) => {
    try {
      await action()
    } catch (error) {
      cleanupErrors.push(new Error(`failed to clean ${name}`, {cause: error}))
    }
  }
  if (browser) await cleanup('browser', () => browser.close())
  if (preview?.exitCode === null && preview.signalCode === null) {
    await cleanup('preview', async () => {
      const stopped = once(preview, 'exit')
      preview.kill('SIGTERM')
      await stopped
    })
  }
  if (backend?.listening) {
    await cleanup('backend', async () => {
      backend.closeAllConnections()
      await new Promise((resolve) => backend.close(resolve))
    })
  }
  if (unpacked) await cleanup('candidate extraction', () => rm(unpacked, {recursive: true, force: true}))
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'editor restore cleanup failed')
}
