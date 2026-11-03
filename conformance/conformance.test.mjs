import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {loadPack, settle} from './pack/conformance.mjs'

test('the synced helper refuses an absent or empty pack', () => {
  assert.throws(() => loadPack('/nonexistent-portable-doc-pack'), /no golden pack/)
  const empty = mkdtempSync(join(tmpdir(), 'barkever-conformance-'))
  mkdirSync(join(empty, 'blocks'))
  writeFileSync(join(empty, 'stamp.json'), '{}\n')
  assert.throws(() => loadPack(empty), /zero block cases/)
})

test('the repository gate rejects a drifted committed report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-conformance-'))
  const path = join(dir, 'report.json')
  const report = {renderer: 'barkever-blocks', compare: 'dom', pack_stamp: 'pinned', ran_at_sha: 'one', rows: [{type: 'paragraph', status: 'pass'}]}
  assert.deepEqual(settle(report, {path, write: true}), [])
  assert.match(settle({...report, rows: [{type: 'paragraph', status: 'fail', diff: ['drift']}]}, {path}).join('\n'), /row paragraph drifted/)
})
