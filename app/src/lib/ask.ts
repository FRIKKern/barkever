import {blockText, type Note} from './model.ts'
import {newest} from './search.ts'

export type AskNote = {id: string; title: string; text: string}
export type Citation = {id: string; quote: string}
export type Asked = {found: boolean; answer: string; citations: Citation[]; provider: string; model: string; tokens: number; costUsd: number | null; read: number}
export type AskReply = Asked | {error: string}
export type Bridge = {ask(req: {question: string; notes: AskNote[]}): Promise<AskReply>}

export const bridge = () => (globalThis as {barkever?: Bridge}).barkever

export const ASK_NOTES = 8
export const NOTE_CHARS = 6000

const STOP = new Set(
  (
    'the and for are was were what when where which who whom why how did does our you your his her its their with from that this have has had ' +
    'not but can will would should about into over than then them they there these those been any all some just also only very more most ' +
    'som det den har var hva når hvor hvem hvorfor hvordan med fra til ikke men kan vil skal blir ble jeg dere han hun meg oss deg seg ' +
    'sin sitt sine min mitt mine vår vårt våre hadde'
  ).split(' '),
)

export const askWords = (question: string) => [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((w) => w.length > 2 && !STOP.has(w))

export const noteText = (n: Note) => n.blocks.map(blockText).join('\n')

export function pickNotes(notes: Note[], question: string): Note[] {
  const words = askWords(question)
  const docs = notes.map((n) => ({n, title: n.title.toLowerCase(), text: noteText(n).toLowerCase()}))
  const rare = new Map(words.map((w) => [w, 1 / Math.max(1, docs.filter((d) => d.title.includes(w) || d.text.includes(w)).length)]))
  const score = (d: (typeof docs)[number]) => words.reduce((s, w) => s + rare.get(w)! * ((d.title.includes(w) ? 2 : 0) + (d.text.includes(w) ? 1 : 0)), 0)
  return docs
    .map((d) => ({n: d.n, score: score(d)}))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || newest(a.n, b.n))
    .slice(0, ASK_NOTES)
    .map((h) => h.n)
}

export const asked = (n: Note): AskNote => ({id: n.id, title: n.title, text: noteText(n).slice(0, NOTE_CHARS)})

export type Part = {cite: number} | {text: string}

export const parts = (answer: string): Part[] => answer.split(/\[(\d+)\]/).map((text, i) => (i % 2 ? {cite: Number(text)} : {text}))
