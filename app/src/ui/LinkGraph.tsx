import {useMemo, useRef, useState, type KeyboardEvent} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {edgePath, GRAPH, layoutGraph, wrapLabel} from '../lib/graph-layout'
import {snippet, UNTITLED, type Note} from '../lib/model'
import {openNote, type Search} from '../lib/scope'
import {sizePx} from '../styles/tokens'
import type {World} from './world'

type Tip = {id: string; left: number; top: number}
type Props = {w: World; note: Note; hover: string | null; onHover: (id: string | null) => void}

const TIP_W = sizePx('w-tip')

export function LinkGraph({w, note, hover, onHover}: Props) {
  const navigate = useNavigate()
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const g = useMemo(() => layoutGraph(note.id, w.links), [note.id, w.links])
  const byKey = new Map(g.nodes.map((n) => [n.key, n]))
  const lit = (id: string) => !!hover && (id === hover || id === note.id)

  const enter = (id: string, el: SVGGElement) => {
    onHover(id)
    const box = wrap.current!.getBoundingClientRect()
    const dot = el.querySelector('.b')!.getBoundingClientRect()
    if (id !== note.id) setTip({id, left: Math.min(Math.max(dot.left - box.left - TIP_W / 2 + dot.width / 2, 8), box.width - TIP_W - 8), top: dot.bottom - box.top + 34})
  }
  const leave = () => (onHover(null), setTip(null))
  const open = (id: string) => (leave(), navigate({to: '/', search: (prev: Search) => openNote(prev, id)}))
  const button = (id: string, label: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onFocus: (e: {currentTarget: SVGGElement}) => enter(id, e.currentTarget),
    onBlur: leave,
    onClick: () => open(id),
    onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(id)),
  })
  const tipNote = tip && w.links.byId.get(tip.id)

  return (
    <div className="graph" ref={wrap}>
      <svg className={hover ? 'hov' : ''} viewBox={`0 0 ${GRAPH.W} ${GRAPH.H}`} role="group" aria-label="Links of this note" data-testid="link-graph">
        <defs>
          <marker id="lg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path className="g-arrow" d="M0 .5 7.5 4 0 7.5z" />
          </marker>
        </defs>
        <text className="g-cap" x={GRAPH.colX} y={22} textAnchor="middle">
          LINKED FROM
        </text>
        <text className="g-cap" x={GRAPH.W - GRAPH.colX} y={22} textAnchor="middle">
          LINKS TO
        </text>
        {g.edges.map((e) => (
          <path
            key={`${e.a}>${e.b}`}
            className={`g-edge ${e.kind}${hover && (e.a === hover || e.b === hover) ? ' on' : ''}`}
            d={edgePath(e, byKey.get(e.a)!, byKey.get(e.b)!)}
            markerEnd={e.kind === 'tagged' ? undefined : 'url(#lg-arrow)'}
            markerStart={e.both ? 'url(#lg-arrow)' : undefined}
          />
        ))}
        {g.nodes.map((n) => {
          const m = n.id ? w.links.byId.get(n.id) : undefined
          const lines = n.label ? [n.label] : wrapLabel(m?.title || UNTITLED, n.kind === 'center' ? 18 : 16)
          return (
            <g
              key={n.key}
              className={`g-node ${n.kind}${n.id && lit(n.id) ? ' on' : ''}`}
              transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
              data-id={n.id && n.kind !== 'center' ? n.id : undefined}
              data-testid={n.kind === 'center' ? 'graph-center' : n.id ? 'graph-node' : undefined}
              onMouseEnter={n.id ? (e) => enter(n.id!, e.currentTarget) : undefined}
              onMouseLeave={n.id ? leave : undefined}
              {...(n.id && n.kind !== 'center' ? button(n.id, m?.title || UNTITLED) : {})}
            >
              {n.kind === 'center' && <circle className="halo" r={n.r + 7} />}
              <circle r={n.r + 7} fill="transparent" />
              <circle className="b" r={n.r} style={{fill: w.shelf.colour(m?.notebook ?? null), stroke: n.kind === 'tagged' ? w.shelf.colour(m?.notebook ?? null) : undefined}} />
              {n.kind !== 'd2' && (
                <text textAnchor="middle">
                  {lines.map((l, i) => (
                    <tspan key={i} x="0" y={n.r + 13 + i * 12.5}>
                      {l}
                    </tspan>
                  ))}
                </text>
              )}
              {n.kind === 'd2' && m && <title>{m.title || UNTITLED}</title>}
            </g>
          )
        })}
        {g.empty && (
          <text className="g-hint" x={GRAPH.W / 2} y={22} textAnchor="middle">
            No links yet
          </text>
        )}
      </svg>
      {tip && tipNote && (
        <div className="tip" style={{left: tip.left, top: tip.top}} data-testid="graph-tip">
          <span className="nbline">
            <span className="dot" style={{background: w.shelf.colour(tipNote.notebook)}} />
            {w.shelf.path(tipNote.notebook).join(' › ')} · {w.links.degree(tipNote.id)} link{w.links.degree(tipNote.id) === 1 ? '' : 's'}
          </span>
          <b>{tipNote.title || UNTITLED}</b>
          {snippet(tipNote, w.links.title)}
        </div>
      )}
      <div className="legend">
        <span>
          <i />
          link
        </span>
        <span>
          <i className="t" />
          same tag
        </span>
      </div>
    </div>
  )
}
