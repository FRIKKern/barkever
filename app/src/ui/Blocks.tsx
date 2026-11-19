import {Link} from '@tanstack/react-router'
import {childrenOf, codeOf, contentOf, itemContent, itemsOf, leafText, linkMissing, listStart, nestedLists, linkWords, type Block, type Inline, type Item, type Title} from '../lib/model'
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
      leafText(x) || <Inlines key={i} c={childrenOf(x)} at={at} />
    ),
  )
}

const FETCHABLE = /^https?:\/\//i
const CODE = {
  border: 0,
  borderRadius: 'var(--bp-codeblock-radius, 0)',
  padding: 'var(--bp-codeblock-pad, 0.9rem 1.1rem)',
  margin: 'var(--bp-codeblock-margin, 1.2rem 0)',
  fontFamily: 'var(--paper-font-mono, ui-monospace,Menlo,monospace)',
  fontSize: 'var(--bp-codeblock-size, 0.9rem)',
  lineHeight: 'var(--bp-codeblock-lh, 1.5)',
  overflowX: 'auto',
  whiteSpace: 'pre',
} as const
const RULE = {position: 'relative', textAlign: 'center', margin: '2.4rem 0', borderTop: '1px solid'} as const
const MARK = {position: 'relative', top: '-0.7rem', display: 'inline-block', padding: '0 0.8rem', fontSize: '1.1rem'} as const
const IMAGE = {maxWidth: '100%', height: 'auto'}
const QUOTE = {fontStyle: 'italic'}

const Nested = ({it, at}: {it: Item; at: At}) => nestedLists(it).map((c, j) => <BlockView key={j} b={c} at={at} />)

function BlockView({b, at}: {b: Block; at: At}) {
  if (b.type === 'heading') return b.level === 3 ? <h3><Inlines c={contentOf(b)} at={at} /></h3> : <h2><Inlines c={contentOf(b)} at={at} /></h2>
  if (b.type === 'list' && b.task)
    return (
      <ul className="tasks" data-bp-id={b.id}>
        {itemsOf(b).map((it, i) => (
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
    const items = itemsOf(b).map((it, i) => (
      <li key={i}>
        <Inlines c={itemContent(it)} at={at} />
        <Nested it={it} at={at} />
      </li>
    ))
    return b.ordered ? <ol start={listStart(b)}>{items}</ol> : <ul>{items}</ul>
  }
  if (b.type === 'code')
    return (
      <pre className="bp-codeblock" data-lang={typeof b.lang === 'string' && b.lang ? b.lang : undefined} style={CODE}>
        {codeOf(b)}
      </pre>
    )
  if (b.type === 'divider')
    return (
      <div className="bp-section-divider" style={RULE}>
        <span className="bp-section-divider__mark" style={MARK}>
          §
        </span>
      </div>
    )
  if (b.type === 'image')
    return <img src={b.src && FETCHABLE.test(b.src) ? b.src : undefined} alt={b.alt ?? ''} width={b.width} height={b.height} loading="lazy" data-bp-lightboxable="true" style={IMAGE} />
  if (b.type === 'pullquote')
    return (
      <p className="bp-role-pullquote" style={QUOTE}>
        <Inlines c={contentOf(b)} at={at} />
      </p>
    )
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
