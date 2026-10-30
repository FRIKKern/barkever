import {useRef, useState, type FormEvent} from 'react'
import {Link} from '@tanstack/react-router'
import {asked, bridge, parts, pickNotes, type AskReply, type Asked} from '../lib/ask'
import type {Note} from '../lib/model'
import type {Search} from '../lib/scope'
import {useAi} from './local-prefs'
import type {World} from './world'

type Turn = {id: number; q: string; sent: Note[]; checked: number; reply?: AskReply}

const cost = (a: Asked) => (a.costUsd === null ? `${a.tokens.toLocaleString('en')} tokens` : `≈ $${a.costUsd.toFixed(3)}`)

function Answer({w, s, turn, a}: {w: World; s: Search; turn: Turn; a: Asked}) {
  const sent = new Map(turn.sent.map((n) => [n.id, n]))
  const cite = (i: number) => (
    <Link key={`c${i}`} to="/" search={{...s, n: a.citations[i - 1].id}} className="cite" data-testid="ask-cite">
      {i}
    </Link>
  )
  const text = parts(a.answer).map((p, i) => ('cite' in p ? cite(p.cite) : <span key={i}>{p.text}</span>))
  return (
    <div className="a" data-testid="ask-answer">
      {a.found ? <p>{text}</p> : <div className="nf"><b>Not in your notes.</b>{text}</div>}
      <div className="srcs">
        {a.citations.map((c, i) => {
          const n = sent.get(c.id)!
          return (
            <Link key={i} to="/" search={{...s, n: c.id}} className="src" data-testid="ask-source">
              <span className="t">
                <span className="cite">{i + 1}</span>
                <span className="dot" style={{background: w.shelf.colour(n.notebook)}} />
                {n.title}
              </span>
              <span className="qt">“{c.quote}”</span>
            </Link>
          )
        })}
      </div>
      <div className="meta" data-testid="ask-meta">
        {a.found ? 'Read' : 'Checked'} {a.read} notes · {a.model} · your login · {cost(a)}
      </div>
    </div>
  )
}

function Reply({w, s, turn}: {w: World; s: Search; turn: Turn}) {
  const r = turn.reply
  if (!turn.sent.length)
    return (
      <div className="a nf" data-testid="ask-answer">
        <b>Not in your notes.</b>No note mentions this. Checked {turn.checked} notes; nothing was sent.
      </div>
    )
  if (!r) return <div className="a meta">Reading {turn.sent.length} notes…</div>
  if ('error' in r)
    return (
      <div className="a nf err" data-testid="ask-error">
        <b>Ask failed.</b>
        {r.error}
      </div>
    )
  return <Answer w={w} s={s} turn={turn} a={r} />
}

export function AskPanel({w, s}: {w: World; s: Search}) {
  const [on, toggle] = useAi()
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const next = useRef(0)
  const api = bridge()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const question = q.trim()
    if (!question) return
    const turn: Turn = {id: next.current++, q: question, sent: pickNotes(w.lib.notes, question), checked: w.lib.notes.length}
    setQ('')
    setTurns((t) => [...t, turn])
    if (!turn.sent.length) return
    const reply = await api!.ask({question, notes: turn.sent.map(asked)})
    setTurns((t) => t.map((x) => (x.id === turn.id ? {...x, reply} : x)))
  }

  const off = !api ? 'Ask runs in the Barkever Mac app.' : !on && 'AI is off. Nothing leaves this Mac.'
  return (
    <div className="ask" data-testid="ask">
      <div className="ask-head">
        <div>
          <strong>✨ Ask your notes</strong>
          <span className="muted">Answers only from your notes and cites each one. Never edits.</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={on} onChange={toggle} data-testid="ai-switch" />
          AI
        </label>
      </div>
      {off ? (
        <div className="ai-off" data-testid="ai-off">{off}</div>
      ) : (
        <>
          <div className="thread">
            {turns.map((t) => (
              <div key={t.id} className="turn">
                <div className="q">{t.q}</div>
                <Reply w={w} s={s} turn={t} />
              </div>
            ))}
          </div>
          <div className="ask-in">
            <form onSubmit={submit}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your notes…" aria-label="Ask about your notes" autoComplete="off" />
              <button className="btn primary">Ask</button>
            </form>
            <div className="fine">Note text is treated as data, never as instructions.</div>
          </div>
        </>
      )}
    </div>
  )
}
