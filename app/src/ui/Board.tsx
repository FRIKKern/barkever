import {forwardRef, useImperativeHandle, useRef} from 'react'
import {Link} from '@tanstack/react-router'
import {Icon} from './icons'
import type {World} from './world'

export type BoardHandle = {menu: () => void}
type Props = {w: World; onMenu: () => void}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const Board = forwardRef<BoardHandle, Props>(function Board({w, onMenu}, handle) {
  const menuRef = useRef<HTMLButtonElement>(null)
  useImperativeHandle(handle, () => ({menu: () => menuRef.current?.focus()}))
  const b = w.tasks
  return (
    <section className="board" aria-label="Tasks">
      <div className="mhead">
        <button ref={menuRef} className="icon-btn" onClick={onMenu} aria-label="Notebooks" aria-haspopup="dialog">
          <Icon name="menu" />
        </button>
        <span className="mt">Tasks</span>
      </div>
      <div className="bar board-h" data-testid="board-head">
        <b>Tasks</b>
        <span>
          {b.open} open · {b.done} done · from {plural(b.lists, 'checklist')}
        </span>
      </div>
      {b.columns.length === 0 ? (
        <div className="empty">No checklists yet. Start a line in a note with [ ] and a space.</div>
      ) : (
        <div className="cols">
          {b.columns.map((col) => {
            const colour = w.shelf.colour(col.notebook)
            return (
              <div key={col.notebook ?? ''} className="col" data-testid="board-column" data-notebook={col.name}>
                <div className="col-h">
                  <span className="dot" style={{background: colour}} />
                  <b>{col.name}</b>
                  <span className="n">{col.open} open</span>
                </div>
                <div className="prog">
                  <i style={{width: `${(col.done / (col.open + col.done)) * 100}%`, background: colour}} />
                </div>
                {col.cards.map((card) => (
                  <div key={`${card.note}/${card.block}`} className="card" data-testid="task-card" data-note-id={card.note}>
                    <Link className="card-t" to="/" search={{n: card.note}}>
                      {card.title}
                    </Link>
                    {card.tasks.map((t, i) => (
                      <Link key={i} className={`tk${t.done ? ' done' : ''}${t.depth ? ' sub' : ''}`} to="/" search={{n: card.note, line: t.line}} title="Open at this line" data-testid="task" data-done={t.done}>
                        <span className="cb" aria-hidden />
                        <span className="tt">{t.text}</span>
                        <span className="go" aria-hidden>
                          ↗ line
                        </span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
})
