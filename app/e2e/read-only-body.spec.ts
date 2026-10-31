import {expect, test} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {created} from './devices'
import {oldEditor} from './old-editor'

test.afterAll(() => deleteNotes(created))

const text = (value: string) => ({type: 'text', value})

test('the read-only body draws each shape: h2 and h3, done and open lines of every item shape, a mark with empty text over its words, a node with no words', async ({page}) => {
  const id = `note-read-only-${Date.now()}`
  created.push(id)
  const blocks = [
    {id: 'h2', type: 'heading', level: 2, content: [text('Big heading')]},
    {id: 'h3', type: 'heading', level: 3, content: [text('Small heading')]},
    {id: 'p', type: 'paragraph', content: [{type: 'strong', text: '', children: [text('Rope')]}, {type: 'hardBreak'}, text(' stays.')]},
    {id: 't', type: 'list', task: true, items: [{content: [text('Done line')], checked: true}, {content: [text('Open line')], checked: false}, 'String line', [text('Array line')]]},
  ]
  const doc = {_id: id, _type: 'note', title: 'Read-only shapes', notebook: {_ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks}}
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: doc}]})})
  expect(res.status).toBe(200)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(oldEditor)
  await page.goto(`/?n=${id}`)
  const body = page.getByTestId('body')
  await expect(body.locator('h2')).toHaveText('Big heading', {timeout: 30_000})
  await expect(body.locator('h3')).toHaveText('Small heading')
  await expect(body.locator('p')).toHaveText('Rope stays.')
  await expect(body.locator('ul.tasks > li.done .li-t')).toHaveText(['Done line'])
  await expect(body.locator('ul.tasks > li:not(.done) .li-t')).toHaveText(['Open line', 'String line', 'Array line'])
  expect(errors).toEqual([])
})
