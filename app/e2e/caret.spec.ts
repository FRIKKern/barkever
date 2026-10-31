import {expect, test, type Page} from '@playwright/test'
import {lineAtCaret} from './caret'

const PAGE = `
  <article><textarea id="title">Untitled</textarea></article>
  <div contenteditable="true">
    <h1 id="head">Heading</h1>
    <p id="plain">Plain line</p>
    <p id="marked">Some <strong id="bold">bold</strong> words</p>
    <p id="empty"><br></p>
    <ul><li><p id="parent">x</p><ul><li><p id="nested">Buy packing tape</p></li></ul></li></ul>
  </div>
  <div contenteditable="false"><p id="readonly">Read-only line</p></div>
  <p id="outside">Outside the editor</p>`

const collapse = (page: Page, id: string, child: 'text' | 'element') =>
  page.evaluate(
    ([id, child]) => {
      const el = document.getElementById(id)!
      const at = child === 'text' ? el.firstChild! : el
      getSelection()!.collapse(at, 0)
    },
    [id, child] as const,
  )

test.beforeEach(({page}) => page.setContent(PAGE))

test('lineAtCaret reads the words of the line that holds the caret', async ({page}) => {
  const cases: [string, 'text' | 'element', string][] = [
    ['plain', 'text', 'Plain line'],
    ['bold', 'text', 'Some bold words'],
    ['empty', 'element', ''],
    ['nested', 'text', 'Buy packing tape'],
    ['parent', 'text', 'x'],
  ]
  for (const [id, child, words] of cases) {
    await collapse(page, id, child)
    expect(await lineAtCaret(page), id).toBe(words)
  }
})

test('lineAtCaret is null with no selection, with the caret in the title, in a line that is not a paragraph, in a read-only body, and in a paragraph outside the editor', async ({page}) => {
  await page.evaluate(() => getSelection()!.removeAllRanges())
  expect(await lineAtCaret(page), 'no selection').toBeNull()
  await page.locator('#title').focus()
  expect(await lineAtCaret(page), 'caret in the title').toBeNull()
  await collapse(page, 'head', 'text')
  expect(await lineAtCaret(page), 'caret in a heading').toBeNull()
  await collapse(page, 'readonly', 'text')
  expect(await lineAtCaret(page), 'caret in a read-only body').toBeNull()
  await collapse(page, 'outside', 'text')
  expect(await lineAtCaret(page), 'caret outside the editor').toBeNull()
})

test('lineAtCaret follows the focus end of a selection across two lines', async ({page}) => {
  await page.evaluate(() => {
    const from = document.getElementById('plain')!.firstChild!
    const to = document.getElementById('nested')!.firstChild!
    getSelection()!.setBaseAndExtent(from, 0, to, 3)
  })
  expect(await lineAtCaret(page)).toBe('Buy packing tape')
  await page.evaluate(() => {
    const from = document.getElementById('nested')!.firstChild!
    const to = document.getElementById('plain')!.firstChild!
    getSelection()!.setBaseAndExtent(from, 3, to, 0)
  })
  expect(await lineAtCaret(page)).toBe('Plain line')
})
