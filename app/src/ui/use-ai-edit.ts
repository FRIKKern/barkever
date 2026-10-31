import {useEffect, useState, type RefObject} from 'react'
import {bridge} from '../lib/ask'
import {editRequest, editable, rewrite, textOf, type Change, type EditReply, type Edited} from '../lib/ai-edit'
import type {Block, Note} from '../lib/model'
import {markDirty, markSaved, savePoint} from '../lib/saver'
import {editBody} from '../replica/local'
import type {BodyHandle} from './BodyCanvas'

export type Status = 'pending' | 'accepted' | 'rejected'
export type Item = Change & {before: string; status: Status}
export type Run = {instruction: string; pre: Block[]; reply?: EditReply; items: Item[]}

const itemsOf = (pre: Block[], r: Edited): Item[] => r.changes.map((c) => ({...c, before: textOf(pre.find((b) => b.id === c.block)!), status: 'pending'}))

export type AiEditing = ReturnType<typeof useAiEdit>

export function useAiEdit(note: Note, body: RefObject<BodyHandle | null>) {
  const [run, setRun] = useState<Run | null>(null)

  const write = async (to: (base: Block[]) => Block[]) => {
    const base = body.current!.blocks()
    markDirty(note.id, 'body')
    const upTo = savePoint(note.id, 'body')
    const saved = await editBody(note.id, base, to(base))
    markSaved(note.id, 'body', upTo)
    body.current!.show(saved ?? to(base))
  }

  const start = async (instruction: string, ids: string[]) => {
    const pre = body.current!.blocks()
    setRun({instruction, pre, items: []})
    const reply = await bridge()!.edit(editRequest(note, instruction, editable(pre, ids))).catch((e: Error): EditReply => ({error: e.message}))
    setRun({instruction, pre, reply, items: 'error' in reply ? [] : itemsOf(pre, reply)})
  }

  const decide = async (picks: number[], status: Status) => {
    const chosen = picks.filter((i) => run!.items[i].status === 'pending')
    setRun((r) => r && {...r, items: r.items.map((x, i) => (chosen.includes(i) ? {...x, status} : x))})
    if (status === 'accepted' && chosen.length) await write((base) => chosen.reduce((b, i) => rewrite(b, run!.items[i]), base))
  }

  const accepted = run?.items.some((x) => x.status === 'accepted') ?? false
  const undo = async () => {
    const pre = run!.pre
    setRun(null)
    await write(() => pre)
  }

  useEffect(() => {
    if (!accepted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      e.preventDefault()
      e.stopPropagation()
      void undo()
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [accepted, run])

  useEffect(() => setRun(null), [note.id])

  return {run, start, decide, undo, done: () => setRun(null), accepted}
}
