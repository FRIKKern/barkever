import {Link} from '@tanstack/react-router'
import {itemContent, type Block, type Inline} from '../lib/model'
import type {Search} from '../lib/scope'

function Inlines({c, s}: {c: Inline[]; s: Search}) {
  return c.map((x, i) =>
    x.type === 'text' ? (
      x.value
    ) : x.type === 'wikilink' ? (
      <Link key={i} className="wl" to="/" search={{...s, n: x.docId || x.target}}>
        <Inlines c={x.children ?? []} s={s} />
      </Link>
    ) : (
      <Inlines key={i} c={x.children ?? []} s={s} />
    ),
  )
}

function BlockView({b, s}: {b: Block; s: Search}) {
  if (b.type === 'heading') return b.level === 3 ? <h3>{b.text ?? <Inlines c={b.content ?? []} s={s} />}</h3> : <h2>{b.text ?? <Inlines c={b.content ?? []} s={s} />}</h2>
  if (b.type === 'list' && b.task)
    return (
      <ul className="tasks">
        {(b.items ?? []).map((it, i) => (
          <li key={i} className={!Array.isArray(it) && it.checked ? 'done' : ''}>
            <span className="cb" />
            <span className="li-t">
              <Inlines c={itemContent(it)} s={s} />
            </span>
          </li>
        ))}
      </ul>
    )
  if (b.type === 'list') {
    const items = (b.items ?? []).map((it, i) => (
      <li key={i}>
        <Inlines c={itemContent(it)} s={s} />
      </li>
    ))
    return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
  }
  if (b.type === 'paragraph' || b.type === 'blockquote')
    return (
      <p>
        <Inlines c={b.content ?? []} s={s} />
      </p>
    )
  return null
}

export const Blocks = ({blocks, s}: {blocks: Block[]; s: Search}) => (
  <div className="blocks">
    {blocks.map((b) => (
      <BlockView key={b.id} b={b} s={s} />
    ))}
  </div>
)
