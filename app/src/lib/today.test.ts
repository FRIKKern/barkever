import {test} from 'node:test'
import assert from 'node:assert/strict'
import {shelve} from './notebooks.ts'
import {dayId, dayKey, dayTitle, today, untouchedDay} from './today.ts'
import type {Note} from './model.ts'

const LATE = new Date('2026-11-18T23:30:00Z')

test('the day is the local date: near midnight it follows the time zone, not UTC', () => {
  assert.equal(dayKey(LATE, 'UTC'), '2026-11-18')
  assert.equal(dayKey(LATE, 'Europe/Oslo'), '2026-11-19')
  assert.equal(dayKey(new Date('2026-11-19T04:59:00Z'), 'America/New_York'), '2026-11-18')
  assert.equal(dayKey(new Date('2026-11-19T05:00:00Z'), 'America/New_York'), '2026-11-19')
  assert.equal(dayKey(new Date('2026-01-02T12:00:00Z'), 'Asia/Tokyo'), '2026-01-02')
})

test('the title is the date in plain words for the locale, the same wherever the device is', () => {
  assert.match(dayTitle('2026-11-18', 'en-GB'), /^Wed,? 18 Nov 2026$/)
  assert.match(dayTitle('2026-11-19', 'en-US'), /^Thu,? Nov 19,? 2026$/)
  assert.equal(dayTitle('2026-11-18', 'en-GB'), dayTitle('2026-11-18', 'en-GB'))
})

test('the note id comes from the date alone, so every device names today the same', () => {
  assert.equal(dayId('2026-11-18'), 'note-day-2026-11-18')
  assert.match(dayId('2026-11-18'), /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)
})

const nb = (id: string, name: string, parent: string | null = null) => ({id, name, parent})

test('today lands in a Daily notebook, else the Inbox, else the first notebook, else nowhere', () => {
  const at = new Date('2026-11-18T09:00:00Z')
  const opts = {timeZone: 'UTC', locale: 'en-GB'}
  const day = today(at, shelve([nb('a', 'Archive'), nb('i', 'Inbox'), nb('d', 'daily', 'a')]), opts)
  assert.deepEqual(day, {id: 'note-day-2026-11-18', title: dayTitle('2026-11-18', 'en-GB'), notebook: 'd', blockId: 'note-day-2026-11-18-p0'})
  assert.equal(today(at, shelve([nb('a', 'Archive'), nb('i', 'INBOX')]), opts)?.notebook, 'i')
  assert.equal(today(at, shelve([nb('b', 'Work'), nb('a', 'Archive')]), opts)?.notebook, 'a')
  assert.equal(today(at, shelve([]), opts), null)
})

const note = (id: string, title: string, text = ''): Note => ({id, title, notebook: 'i', tags: [], blocks: [{id: `${id}-p0`, type: 'paragraph', content: text ? [{type: 'text', value: text}] : []}], links: [], updatedAt: '', rev: '', conflicts: [], gen: 0})

test('a day note still holding only its date title is untouched; any words or a renamed title are not', () => {
  const id = dayId('2026-11-18')
  const title = dayTitle('2026-11-18', 'en-GB')
  assert.equal(untouchedDay(note(id, title), 'en-GB'), true)
  assert.equal(untouchedDay(note(id, title, 'x'), 'en-GB'), false)
  assert.equal(untouchedDay(note(id, `${title} plans`), 'en-GB'), false)
  assert.equal(untouchedDay(note('note-123', title), 'en-GB'), false)
})
