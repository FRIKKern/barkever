import {useMemo} from 'react'
import {curve, layoutMap} from '../lib/mini-map'
import type {World} from './world'

const nodeR = (degree: number) => 16 + Math.min(degree, 4) * 3

export function MiniMap({w, sel}: {w: World; sel?: string}) {
  const {lib, links, shelf} = w
  const map = useMemo(() => layoutMap(lib, links), [lib, links])
  if (!map.boxes.length) return null
  return (
    <figure className="mini" aria-label="Map of notebooks and links">
      <div className="mini-h">
        <b>Map</b>
        {lib.notes.length} notes · {links.total} links
      </div>
      <svg viewBox={`-10 -10 ${map.W + 20} ${map.H + 20}`} aria-hidden="true">
        {map.boxes.map((b) => (
          <rect key={b.id} className="mb-r" x={b.x} y={b.y} width={b.w} height={b.h} rx={22} style={{fill: shelf.colour(b.id), stroke: shelf.colour(b.id)}} />
        ))}
        {lib.notes.flatMap((n) =>
          links.outs(n.id).map((t) => {
            const a = map.pos.get(n.id)
            const b = map.pos.get(t)
            return a && b ? <path key={`${n.id}>${t}`} className="m-edge" d={curve(a, b, nodeR(links.degree(n.id)) + 1, nodeR(links.degree(t)) + 1)} /> : null
          }),
        )}
        {lib.notes.map((n) => {
          const at = map.pos.get(n.id)
          return at ? (
            <g key={n.id} className={`m-node${n.id === sel ? ' sel' : ''}`} transform={`translate(${at.x} ${at.y})`}>
              <circle r={nodeR(links.degree(n.id))} style={{fill: shelf.colour(n.notebook)}} />
            </g>
          ) : null
        })}
      </svg>
    </figure>
  )
}
