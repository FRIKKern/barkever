import {useState, type FormEvent} from 'react'
import {Link} from '@tanstack/react-router'
import type {Edited} from '../lib/ai-edit'
import type {Block} from '../lib/model'
import type {Search} from '../lib/scope'
import {wordDiff} from '../lib/word-diff'
import {Blocks} from './Blocks'
import type {AiEditing, Item, Run} from './use-ai-edit'
import type {World} from './world'

type Edit = AiEditing & {run: Run}

const cost = (a: Edited) => (a.costUsd === null ? `${a.tokens.toLocaleString('en')} tokens` : `≈ $${a.costUsd.toFixed(3)}`)

export function AiPrompt({onRun, onCancel}: {onRun: (instruction: string) => void; onCancel: () => void}) {
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) onRun(q.trim())
  }
  return (
    <form className="ai-prompt" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), onCancel())}>
      <span>✨</span>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tighten, shorten, fix the spelling…" aria-label="What should AI change?" autoComplete="off" />
      <button className="btn primary sm">Edit</button>
    </form>
  )
}

function Diff({x}: {x: Item}) {
  if (x.status === 'accepted') return <p>{x.after}</p>
  if (x.status === 'rejected') return <p>{x.before}</p>
  return (
    <p>
      {wordDiff(x.before, x.after).map((p, i) => {
        const gap = i ? ' ' : ''
        return p.kind === 'same' ? `${gap}${p.text}` : p.kind === 'del' ? <span key={i}>{gap}<del>{p.text}</del></span> : <span key={i}>{gap}<ins>{p.text}</ins></span>
      })}
    </p>
  )
}

function Change({x, i, decide}: {x: Item; i: number; decide: Edit['decide']}) {
  return (
    <div className={`chg ${x.status}`} data-testid="ai-change">
      <div className="chg-h">
        <span className="num">{i + 1}</span>Rewrite
        <span className="acts">
          {x.status === 'pending' ? (
            <>
              <button className="acc" onClick={() => decide([i], 'accepted')} data-testid="ai-accept">✓ Accept</button>
              <button className="rej" onClick={() => decide([i], 'rejected')} data-testid="ai-reject">✕ Reject</button>
            </>
          ) : (
            <span className={`state-tag ${x.status}`}>{x.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>
          )}
        </span>
      </div>
      <Diff x={x} />
    </div>
  )
}

export function AiBar({w, s, edit}: {w: World; s: Search; edit: Edit}) {
  const {run, decide, undo, done, accepted} = edit
  const r = run.reply
  const all = run.items.map((_, i) => i)
  const pending = run.items.filter((x) => x.status === 'pending').length
  const title = (id: string) => w.lib.notes.find((n) => n.id === id)?.title ?? id
  return (
    <div className="ai-head" data-testid="ai-bar">
      <div className="aibar">
        <span>✨</span>
        <b>AI Edit</b>
        <span className="ai-q">“{run.instruction}”</span>
        <span className="grow" />
        {r && !('error' in r) && <span className="muted" data-testid="ai-edit-meta">{r.model} · your login · {cost(r)}</span>}
      </div>
      <div className="aibar sub">
        {!r ? (
          <span className="muted">Rewriting the selection…</span>
        ) : 'error' in r ? (
          <span className="ai-err" data-testid="ai-error"><b>AI Edit failed.</b> {r.error}</span>
        ) : (
          <>
            <b>{run.items.length ? `${run.items.length} changes` : 'No changes proposed'}</b>
            <span className="muted">{pending ? `${pending} to review` : 'all reviewed'}</span>
            {r.citations.map((c, i) => (
              <Link key={i} to="/" search={{...s, n: c.id}} className="ai-src" title={`“${c.quote}”`} data-testid="ai-source">{title(c.id)}</Link>
            ))}
          </>
        )}
        <span className="grow" />
        {pending ? (
          <>
            <button className="acc" onClick={() => decide(all, 'accepted')} data-testid="ai-accept-all">Accept all</button>
            <button className="rej" onClick={() => decide(all, 'rejected')} data-testid="ai-reject-all">Reject all</button>
          </>
        ) : (
          r && (
            <>
              {accepted && <button className="btn sm" onClick={undo} data-testid="ai-undo">Undo AI Edit <kbd>⌘Z</kbd></button>}
              <button className="btn sm primary" onClick={done} data-testid="ai-done">Done</button>
            </>
          )
        )}
      </div>
    </div>
  )
}

export function AiBody({s, edit, title}: {s: Search; edit: Edit; title: (id?: string) => string | undefined}) {
  const at = new Map(edit.run.items.map((x, i) => [x.block, i]))
  const one = (b: Block) => {
    const i = at.get(b.id)
    return i === undefined ? <Blocks key={b.id} blocks={[b]} s={s} title={title} /> : <Change key={b.id} x={edit.run.items[i]} i={i} decide={edit.decide} />
  }
  return <div className="doc-body ai-body">{edit.run.pre.map(one)}</div>
}

export function AiEditButton({ready, onOpen, icon}: {ready: boolean; onOpen: () => void; icon?: boolean}) {
  return (
    <button
      className={icon ? 'icon-btn ai-btn' : 'btn ai-btn'}
      disabled={!ready}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
      title="Rewrite the selection with AI; you review every change"
      aria-label="AI Edit"
      data-testid="ai-edit"
    >
      ✨{!icon && ' AI Edit'}
    </button>
  )
}
