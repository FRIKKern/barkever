import {strict as assert} from 'node:assert'
import {test} from 'node:test'
import {failedRequests} from './failed-requests.mjs'

const at = (path, responseStatus) => ({name: `http://127.0.0.1:4100${path}`, responseStatus})

test('a navigation or resource that answered 0 or 400 and up is a failed request, named by its path', () => {
  const entries = [at('/sign-in', 200), at('/assets/index-0000.js', 404), at('/assets/app-0000.css', 400), at('/sw.js', 399), at('/editor-files', 0), at('/x', 500), at('/y', 304)]
  assert.deepEqual(failedRequests(entries), ['/assets/index-0000.js 404', '/assets/app-0000.css 400', '/editor-files 0', '/x 500'])
})

test('a page whose requests all answered is clean', () => {
  assert.deepEqual(failedRequests([at('/sign-in', 200), at('/assets/index-0000.js', 200), at('/sw.js', 304)]), [])
})
