import {expect, test} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'

const SPLIT = `note-tag-case-${Date.now()}`
const LOOSE = `note-no-notebook-${Date.now()}`
test.afterAll(() => deleteNotes([SPLIT, LOOSE]))

const doc = (_id: string, title: string, rest: object) => ({_id, _type: 'note', title, links: [], body: {blocks: [{id: 'p', type: 'paragraph', content: [{type: 'text', value: 'Words.'}]}]}, ...rest})

test.beforeAll(async () => {
  const mutations = [{createOrReplace: doc(SPLIT, 'Split tag spelling', {notebook: {_ref: 'fx-nb-inbox'}, tags: ['Harbor']})}, {createOrReplace: doc(LOOSE, 'In no notebook', {tags: []})}]
  expect((await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations})})).status).toBe(200)
})

test('J04: ?tag=harbor includes a note tagged Harbor, and the sidebar lists the tag once, selected in any case', async ({page}) => {
  await page.goto('/?tag=harbor')
  await expect(page.getByTestId('note-row').filter({hasText: 'Split tag spelling'})).toBeVisible({timeout: 30_000})
  const more = page.getByTestId('side-tags-more')
  if (await more.count()) await more.click()
  await expect(page.getByTestId('side-tag').filter({hasText: /^#harbor$/i})).toHaveCount(1)
  await page.goto('/?tag=HARBOR')
  await expect(page.getByTestId('side-tag').filter({hasText: /^#harbor$/i})).toHaveClass(/\bon\b/, {timeout: 30_000})
})

test('J03: a note in no notebook says so in its crumb', async ({page}) => {
  await page.goto(`/?n=${LOOSE}`)
  await expect(page.locator('.ed-bar .crumb')).toHaveText('No notebook', {timeout: 30_000})
})
