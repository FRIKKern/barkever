import {useState} from 'react'
import {Link} from '@tanstack/react-router'
import {linkContext, UNTITLED, type Note} from '../lib/model'
import type {Search} from '../lib/scope'
import {Icon} from './icons'
import {LinkGraph} from './LinkGraph'
import type {World} from './world'

type Props = {w: World; s: Search; note: Note; onRail: () => void}

export function Rail({w, s, note, onRail}: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const ins = w.links.backs(note.id)
  const outs = w.links.outs(note.id)
  const shared = w.links.sharesTag(note.id, 4)

  const row = (id: string, context: string, testid: string) => {
    const m = w.links.byId.get(id)!
    return (
      <Link
        key={id}
        to="/"
        search={{...s, n: id}}
        className={`rel-row${hover === id ? ' hl' : ''}`}
        onMouseEnter={() => setHover(id)}
        onMouseLeave={() => setHover(null)}
        data-testid={testid}
      >
        <span className="t">
          <span className="dot" style={{background: w.shelf.colour(m.notebook)}} />
          {m.title || UNTITLED}
        </span>
        {context && <span className="c">{context}</span>}
      </Link>
    )
  }

  return (
    <aside className="rail" aria-label="Connections">
      <div className="bar rail-bar">
        <span className="rail-h">Connections</span>
        <button className="icon-btn" onClick={onRail} title="Hide connections" aria-label="Hide connections">
          <Icon name="rail" />
        </button>
      </div>
      <div className="rail-body">
        <LinkGraph w={w} note={note} hover={hover} onHover={setHover} />
        <section className="rel">
          <h4>Linked from · {ins.length}</h4>
          {ins.length ? ins.map((id) => row(id, linkContext(w.links.byId.get(id)!.blocks, note.id, w.links.title), 'linked-from')) : <div className="rel-empty">No note links here yet.</div>}
        </section>
        <section className="rel">
          <h4>Links to · {outs.length}</h4>
          {outs.length ? outs.map((id) => row(id, '', 'links-to')) : <div className="rel-empty">This note links nowhere yet.</div>}
        </section>
        {shared.length > 0 && (
          <section className="rel">
            <h4>Shares a tag</h4>
            {shared.map((id) => row(id, `#${w.links.byId.get(id)!.tags.filter((t) => note.tags.includes(t)).join(' #')}`, 'shares-tag'))}
          </section>
        )}
      </div>
    </aside>
  )
}
