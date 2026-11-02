import {useEffect, useRef, useState, type RefObject} from 'react'
import {bridge} from '../lib/ask'
import {checked, editRequest, editable, rewrite, textOf, type Change, type EditReply, type Edited} from '../lib/ai-edit'
import type {Block, Note} from '../lib/model'
import {markDirty, markSaved, savePoint} from '../lib/saver'
import {editBody} from '../replica/local'
import type {BodyHandle} from './BodyCanvas'

export type Status = 'pending' | 'accepted' | 'rejected'
export type Item = Change & {before: string; status: Status}
export type Run = {instruction: string; pre: Block[]; reply?: EditReply; items: Item[]; old?: string | null}

const itemsOf = (pre: Block[], r: Edited): Item[] => r.changes.map((c) => ({...c, before: textOf(pre.find((b) => b.id === c.block)!), status: 'pending'}))

export type AiEditing = ReturnType<typeof useAiEdit>

export function useAiEdit(note: Note, body: RefObject<BodyHandle | null>) {
  const [run, setRun] = useState<Run | null>(null)
  const shown = useRef<Block[]>([])

  const write = async (next: Block[]) => {
    const base = shown.current
    shown.current = next
    markDirty(note.id, 'body')
    const upTo = savePoint(note.id, 'body')
    const saved = await editBody(note.id, base, next)
    markSaved(note.id, 'body', upTo)
    body.current!.show(saved!)
  }

  const start = async (instruction: string, ids: string[]) => {
    const pre = body.current!.blocks()
    shown.current = pre
    setRun({instruction, pre, items: []})
    const answer = await bridge()!.edit(editRequest(note, instruction, editable(pre, ids))).catch((e: Error): EditReply => ({error: e.message}))
    const {reply, old} = checked(pre, answer)
    setRun({instruction, pre, reply, old, items: 'error' in reply ? [] : itemsOf(pre, reply)})
  }

  const decide = async (picks: number[], status: Status) => {
    const chosen = picks.filter((i) => run!.items[i].status === 'pending')
    setRun((r) => r && {...r, items: r.items.map((x, i) => (chosen.includes(i) ? {...x, status} : x))})
    if (status === 'accepted') await write(chosen.reduce((b, i) => rewrite(b, run!.items[i]), shown.current))
  }

  const accepted = !!run?.items.some((x) => x.status === 'accepted')
  const undo = async () => {
    const pre = run!.pre
    setRun(null)
    await write(pre)
  }

  useEffect(() => {
    if (!accepted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
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
