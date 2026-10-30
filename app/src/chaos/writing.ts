import {edited, modeName, para, placeOf, rawNext, rawVerb, rawWrite, replacedBy, retagged, textOf} from './edits.ts'
import {partsOf, type Truth} from './truth.ts'
import type {Server} from './server.ts'
import {ID, type Job, type Writer} from './writer.ts'
import type {NoteDoc} from '../replica/note.ts'

const {editBody, editTitle, keepVersion, moveNote, retag} = await import('../replica/local.ts')

export type Desk = {
  t: Truth
  server: Server
  step: () => number
  say: (w: Writer | string, what: string) => void
  as: (w: Writer, fn: () => unknown) => Promise<void>
  queue: (w: Writer, job: Job) => void
  note: (w: Writer) => NoteDoc | undefined
  viewOf: (w: Writer) => Writer['view']
}

export function writing({t, server, step, say, as, queue, note, viewOf}: Desk) {
  let rawTyped = 0
  const wrote = (w: Writer, part: string, text: string, over: string) => (t.wrote({part, text, by: w.id, step: step()}), t.revived(part, text, w.id, over), void w.wrote.set(part, [...(w.wrote.get(part) ?? []), text]))

  async function type(w: Writer, a: number, b: number, k: 'type' | 'revert' | 'add' | 'delete') {
    const blocks = w.view.blocks
    const shown = {title: w.view.title, body: {blocks}}
    const back = (p: string) => (w.wrote.get(p) ?? []).filter((x) => x !== textOf(shown, p))
    const token = `${w.id}${++w.typed}`
    let after = blocks
    if (k === 'add') {
      const id = `${w.id.toLowerCase()}${w.typed}`
      after = [...blocks]
      after.splice(Math.floor(a * (blocks.length + 1)), 0, para(id, token))
      wrote(w, `body:${id}`, token, '')
      say(w, `adds block ${id} "${token}"`)
    } else {
      const parts = ['title', ...blocks.map((x) => `body:${x.id}`)].filter((p) => k !== 'revert' || back(p).length)
      const part = k === 'delete' ? parts[1 + Math.floor(a * (parts.length - 1))] : parts[Math.floor(a * parts.length)]
      if (!part) return false
      const old = textOf(shown, part)
      t.editedFrom(part, old, w.id)
      if (k === 'delete') {
        after = blocks.filter((x) => `body:${x.id}` !== part)
        say(w, `deletes block ${part.slice(5)} "${old}"`)
      } else {
        const next = k === 'revert' ? back(part).at(-1 - Math.floor(b * b * back(part).length))! : edited(old, token, b, (a * 7919) % 1)
        wrote(w, part, next, old)
        say(w, `${k === 'revert' ? 'sets back' : modeName(b)} ${placeOf(part)}: "${old}" → "${next}"`)
        if (part === 'title') {
          w.view.title = next
          await as(w, () => editTitle(ID, old, next))
          if (w.connected) queue(w, 'push')
          return true
        }
        after = blocks.map((x) => (`body:${x.id}` === part ? para(x.id, next) : x))
      }
    }
    await as(w, async () => (w.view.blocks = (await editBody(ID, blocks, after)) ?? after))
    if (w.connected) queue(w, 'push')
    return true
  }

  async function organize(w: Writer, a: number, b: number) {
    const token = `${w.id}${++w.typed}`
    if (a < 0.5) {
      const [old, next] = [w.view.tags, retagged(w.view.tags, token, b)]
      t.editedFrom('tags', JSON.stringify(old), w.id)
      t.wrote({part: 'tags', text: JSON.stringify(next), by: w.id, step: step()})
      say(w, `sets tags ${JSON.stringify(old)} → ${JSON.stringify(next)}`)
      w.view.tags = next
      await as(w, () => retag(ID, old, next))
    } else {
      const [old, next] = [w.view.notebook, `nb-${token}`]
      t.editedFrom('notebook', old ?? '', w.id)
      t.wrote({part: 'notebook', text: next, by: w.id, step: step()})
      say(w, `moves the note from notebook ${old} to ${next}`)
      w.view.notebook = next
      await as(w, () => moveNote(ID, old, next))
    }
    if (w.connected) queue(w, 'push')
    return true
  }

  async function keepCopy(w: Writer, a: number) {
    const n = note(w)
    const c = n?.conflicts?.[Math.floor(a * n.conflicts.length)]
    if (!n || !c) return false
    const shown = {title: w.view.title, body: {blocks: w.view.blocks}}
    const copied = new Map(partsOf(c))
    for (const p of replacedBy(c)) {
      t.editedFrom(p, textOf(p === 'tags' || p === 'notebook' ? n : shown, p), w.id)
      if (copied.has(p)) t.wrote({part: p, text: copied.get(p)!, by: `${w.id} (kept)`, step: step()})
    }
    say(w, `keeps copy ${c._key} by ${c.by} (${c.clash.join(',')})`)
    await as(w, () => keepVersion(ID, c._key, shown))
    w.view = viewOf(w)
    if (w.connected) queue(w, 'push')
    return true
  }

  function raw(a: number, b: number) {
    const doc = server.doc
    const parts = partsOf(doc)
    const i = Math.floor(a * (parts.length + 1))
    const token = `R${++rawTyped}`
    if (i === parts.length) {
      const id = `r${rawTyped}`
      t.wrote({part: `body:${id}`, text: token, by: 'raw', step: step()})
      say('raw', `adds block ${id} "${token}" on the server`)
      server.raw((d) => ({...d, body: {blocks: [...(d.body?.blocks ?? []), para(id, token)]}}))
      return
    }
    const [part, old] = parts[i]
    const next = rawNext(part, old, token, a, b)
    t.editedFrom(part, old, 'raw')
    t.wrote({part, text: next, by: 'raw', step: step()})
    say('raw', `${rawVerb(part, b)} on the server: "${old}" → "${next}"`)
    server.raw(rawWrite(part, next))
  }

  return {type, organize, keepCopy, raw}
}
