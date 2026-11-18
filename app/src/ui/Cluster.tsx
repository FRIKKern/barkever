import {useMemo, useState, type KeyboardEvent} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {CLUSTER, clusterLabels, layoutCluster} from '../lib/cluster-layout'
import {curve} from '../lib/mini-map'
import {UNTITLED, type Note} from '../lib/model'
import type {Search} from '../lib/scope'
import type {World} from './world'

export function Cluster({w, note}: {w: World; note: Note}) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const g = useMemo(() => layoutCluster(note.id, w.links), [note.id, w.links])
  const labels = useMemo(() => clusterLabels(g, w.links.title), [g, w.links])
  const at = new Map(g.nodes.map((n) => [n.id, n]))
  const near = new Set(hover ? [hover, ...g.edges.filter((e) => e.a === hover || e.b === hover).flatMap((e) => [e.a, e.b])] : [])
  const open = (id: string) => navigate({to: '/', search: (prev: Search) => ({...prev, n: id})})
  const openMap = () => navigate({to: '/', search: (prev: Search): Search => ({...prev, view: 'map'})})
  const press = (id: string) => (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open(id))

  return (
    <div className="graph cluster">
      <svg className={hover ? 'hov' : ''} viewBox={`0 0 ${CLUSTER.W} ${CLUSTER.H}`} role="group" aria-label="Notes within two links" data-testid="cluster">
        <defs>
          <marker id="cl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path className="g-arrow" d="M0 .5 7.5 4 0 7.5z" />
          </marker>
        </defs>
        <circle className="cl-ring" cx={CLUSTER.cx} cy={CLUSTER.cy} r={CLUSTER.r1} />
        <circle className="cl-ring" cx={CLUSTER.cx} cy={CLUSTER.cy} r={CLUSTER.r2} />
        {g.edges.map((e) => {
          const a = at.get(e.a)!
          const b = at.get(e.b)!
          return <path key={`${e.a}>${e.b}`} className={`g-edge${a.hop + b.hop > 2 ? ' d2' : ''}${near.has(e.a) && near.has(e.b) ? ' on' : ''}`} d={curve(a, b, a.r + 1, b.r + 3)} markerEnd="url(#cl-arrow)" />
        })}
        {g.nodes.map((n) => (
          <g
            key={n.id}
            className={`g-node${n.hop ? '' : ' center'}${near.has(n.id) || (hover && !n.hop) ? ' on' : ''}`}
            transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
            {...(n.hop ? {role: 'button', tabIndex: 0, 'aria-label': w.links.title(n.id) ?? UNTITLED, 'data-id': n.id, 'data-testid': 'cluster-node', onClick: () => open(n.id), onKeyDown: press(n.id), onFocus: () => setHover(n.id), onBlur: () => setHover(null)} : {'data-testid': 'cluster-center'})}
          >
            {!n.hop && <circle className="halo" r={n.r + 7} />}
            <circle r={n.r + 6} fill="transparent" />
            <circle className="b" r={n.r} style={{fill: w.shelf.colour(w.links.byId.get(n.id)?.notebook ?? null)}} />
            <title>{w.links.title(n.id)}</title>
          </g>
        ))}
        <g className="cl-labels" aria-hidden="true">
          {labels.map((b) => (
            <text key={b.id} className={`${at.get(b.id)?.hop ? '' : 'c'}${near.has(b.id) ? ' on' : ''}`} x={b.x + b.w / 2} y={b.y + b.h - 4}>
              {b.text}
            </text>
          ))}
        </g>
        {g.nodes.length === 1 && (
          <text className="g-hint" x={CLUSTER.W / 2} y={22} textAnchor="middle">
            No links yet
          </text>
        )}
      </svg>
      <div className="cl-foot">
        <span>
          {g.nodes.length - 1} within two links{g.more > 0 && ` · ${g.more} more on the map`}
        </span>
        <button className="btn" onClick={openMap} data-testid="cluster-open-map">
          Open the map <kbd>M</kbd>
        </button>
      </div>
    </div>
  )
}
