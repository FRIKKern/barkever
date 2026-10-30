import {Link} from '@tanstack/react-router'
import {contentOf, itemContent, leafText, linkMissing, nestedOf, linkWords, type Block, type Inline, type Item, type Title} from '../lib/model'
import type {Search} from '../lib/scope'

type At = {s: Search; title: Title}

function Inlines({c, at}: {c: Inline[]; at: At}) {
  return c.map((x, i) =>
    x.type === 'wikilink' ? (
      linkMissing(x, at.title) ? (
        <span key={i} className="wl missing">
          {linkWords(x, at.title)}
        </span>
      ) : (
        <Link key={i} className="wl" to="/" search={{...at.s, n: x.docId}}>
          {linkWords(x, at.title)}
        </Link>
      )
    ) : (
      leafText(x) || <Inlines key={i} c={x.children ?? []} at={at} />
    ),
  )
}

const Nested = ({it, at}: {it: Item; at: At}) => nestedOf(it).map((c, j) => <BlockView key={j} b={c} at={at} />)

function BlockView({b, at}: {b: Block; at: At}) {
  if (b.type === 'heading') return b.level === 3 ? <h3><Inlines c={contentOf(b)} at={at} /></h3> : <h2><Inlines c={contentOf(b)} at={at} /></h2>
  if (b.type === 'list' && b.task)
    return (
      <ul className="tasks" data-bp-id={b.id}>
        {(b.items ?? []).map((it, i) => (
          <li key={i} className={typeof it === 'object' && !Array.isArray(it) && it.checked ? 'done' : ''}>
            <span className="cb" />
            <span className="li-t">
              <Inlines c={itemContent(it)} at={at} />
            </span>
            <Nested it={it} at={at} />
          </li>
        ))}
      </ul>
    )
  if (b.type === 'list') {
    const items = (b.items ?? []).map((it, i) => (
      <li key={i}>
        <Inlines c={itemContent(it)} at={at} />
        <Nested it={it} at={at} />
      </li>
    ))
    return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
  }
  if (b.type === 'paragraph' || b.type === 'blockquote')
    return (
      <p>
        <Inlines c={contentOf(b)} at={at} />
      </p>
    )
  return null
}

export const Blocks = ({blocks, s, title}: {blocks: Block[]; s: Search; title: Title}) => (
  <div className="blocks">
    {blocks.map((b) => (
      <BlockView key={b.id} b={b} at={{s, title}} />
    ))}
  </div>
)
