import {useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent} from 'react'
import {useLocation, useNavigate} from '@tanstack/react-router'
import {layoutNotesMap, mapLabels, ZOOMS, type NotesMap as Layout} from '../lib/map-layout'
import {curve} from '../lib/mini-map'
import type {Search} from '../lib/scope'
import {sizePx} from '../styles/tokens'
import {Icon} from './icons'
import {MapCard} from './MapCard'
import {clampStep, useGestures, zoomAt, type View} from './map-gestures'
import type {World} from './world'

type Size = {w: number; h: number}
type Props = {w: World; onLeave: () => void; from?: string}

const ONE = ZOOMS.indexOf(1)
const MARGIN = 48
const CARD_ROOM = sizePx('w-tip') + 2 * MARGIN
const WIDE = 900
const ARROWS: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}
const kept = new Map<number, View>()

const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
const idOf = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-id]')?.getAttribute('data-id') : null) ?? null

function fit(map: Layout, size: Size): View {
  const room = size.w > WIDE ? size.w - CARD_ROOM : size.w
  const k = Math.min((room - 2 * MARGIN) / Math.max(map.W, 1), (size.h - 2 * MARGIN) / Math.max(map.H, 1))
  const step = clampStep(Math.min(ONE, ZOOMS.filter((z) => z <= k).length - 1))
  const z = ZOOMS[step]
  return {step, x: (room - map.W * z) / 2, y: (size.h - map.H * z) / 2}
}

function centreOn(map: Layout, size: Size, id: string | undefined, step: number): View | null {
  const n = id ? map.at.get(id) : undefined
  return n ? {step, x: size.w / 2 - n.x * ZOOMS[step], y: size.h / 2 - n.y * ZOOMS[step]} : null
}

function nearest(map: Layout, id: string, [dx, dy]: [number, number]): string | null {
  const from = map.at.get(id)!
  let best: string | null = null
  let score = Infinity
  for (const n of map.nodes) {
    const along = (n.x - from.x) * dx + (n.y - from.y) * dy
    const s = along + 2 * Math.abs((n.x - from.x) * dy - (n.y - from.y) * dx)
    if (along > 0 && s < score) (score = s), (best = n.id)
  }
  return best
}

export function NotesMap({w, onLeave, from}: Props) {
  const navigate = useNavigate()
  const at = useLocation({select: (l) => l.state.__TSR_index})
  const svg = useRef<SVGSVGElement>(null)
  const map = useMemo(() => layoutNotesMap(w.lib, w.links), [w.lib, w.links])
  const [size, setSize] = useState<Size | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(from ?? null)
  const {onPointerDown, dragged} = useGestures(svg, view, setView)
  const lit = hover ?? focus
  const k = ZOOMS[view?.step ?? ONE]
  const radius = (r: number) => Math.max(r, 4 / k)

  useLayoutEffect(() => {
    const el = svg.current!
    const measure = () => setSize({w: el.clientWidth, h: el.clientHeight})
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const empty = !map.nodes.length
  const placedEmpty = useRef(true)
  useLayoutEffect(() => {
    if (size && (!view || placedEmpty.current)) setView(kept.get(at) ?? centreOn(map, size, from, ONE) ?? fit(map, size))
    if (size) placedEmpty.current = empty
  }, [size, empty])
  useEffect(() => void (view && !empty && kept.set(at, view)), [view, at])
  useEffect(() => {
    if (view && focus) svg.current?.querySelector<SVGGElement>(`[data-id="${CSS.escape(focus)}"]`)?.focus({preventScroll: true})
  }, [!view, empty])

  const zoomBy = (d: number) => size && setView((v) => v && zoomAt(v, v.step + d, {x: size.w / 2, y: size.h / 2}))
  const fitAll = () => size && setView(fit(map, size))
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (typingIn(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') (e.preventDefault(), onLeave())
      else if (e.key === '+' || e.key === '=') zoomBy(1)
      else if (e.key === '-') zoomBy(-1)
      else if (e.key === '0') fitAll()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const open = (id: string) => navigate({to: '/', search: (prev: Search) => ({...prev, n: id, view: undefined})})
  const reveal = (id: string) => {
    const n = map.at.get(id)
    if (!n || !size) return
    setView((v) => {
      if (!v) return v
      const x = n.x * ZOOMS[v.step] + v.x
      const y = n.y * ZOOMS[v.step] + v.y
      const inside = x > MARGIN && x < size.w - MARGIN && y > MARGIN && y < size.h - MARGIN
      return inside ? v : centreOn(map, size, id, v.step)
    })
  }
  const onKey = (e: KeyboardEvent) => {
    const id = idOf(e.target)
    if (!id) return
    if (e.key === 'Enter' || e.key === ' ') return (e.preventDefault(), open(id))
    const next = ARROWS[e.key] && nearest(map, id, ARROWS[e.key])
    if (ARROWS[e.key]) e.preventDefault()
    if (next) svg.current?.querySelector<SVGGElement>(`[data-id="${CSS.escape(next)}"]`)?.focus({preventScroll: true})
  }
  const onFocus = (e: SyntheticEvent) => {
    const id = idOf(e.target)
    setFocus(id)
    if (id) reveal(id)
  }

  const areas = useMemo(
    () => map.areas.map((a) => <rect key={a.id} className="mp-area" x={a.x} y={a.y} width={a.w} height={a.h} rx={22} style={{fill: w.shelf.colour(a.notebook), stroke: w.shelf.colour(a.notebook)}} />),
    [map, w.shelf],
  )
  const edgeD = (a: string, b: string) => {
    const p = map.at.get(a)!
    const q = map.at.get(b)!
    return curve(p, q, radius(p.r) + 1 / k, radius(q.r) + 2 / k)
  }
  const edges = useMemo(() => map.edges.map(([a, b]) => <path key={`${a}>${b}`} className="mp-edge" d={edgeD(a, b)} markerEnd="url(#mp-arrow)" />), [map, k])
  const nodes = useMemo(
    () =>
      map.nodes.map((n) => (
        <g key={n.id} className="mp-node" data-id={n.id} transform={`translate(${n.x} ${n.y})`} role="button" tabIndex={0} aria-label={w.links.title(n.id)} data-testid="map-node">
          <circle r={radius(n.r)} style={{fill: w.shelf.colour(n.area || null)}} />
        </g>
      )),
    [map, k, w.shelf],
  )
  const litEdges = useMemo(() => (lit ? map.edges.filter(([a, b]) => a === lit || b === lit) : []), [map, lit])
  const labels = useMemo(() => mapLabels(map, k, lit ? [lit] : []), [map, k, lit])
  const shown = view && size ? labels.filter((b) => b.x + b.w + view.x > 0 && b.x + view.x < size.w && b.y + b.h + view.y > 0 && b.y + view.y < size.h) : []
  const litNode = lit ? map.at.get(lit) : undefined
  const litNote = lit ? w.links.byId.get(lit) : undefined
  const arrow = (id: string) => (
    <marker id={id} className="mp-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerUnits="userSpaceOnUse" markerWidth={8 / k} markerHeight={8 / k} orient="auto">
      <path d="M0 .5 7.5 4 0 7.5z" />
    </marker>
  )

  return (
    <section className="map" aria-label="Map" data-testid="map">
      <div className="bar map-bar">
        <button className="btn" onClick={onLeave} data-testid="map-leave">
          <Icon name="back" />
          Notes <kbd>Esc</kbd>
        </button>
        <b>Map</b>
        <span className="muted map-stat">
          {map.nodes.length} notes · {map.areas.length} notebooks · {w.links.total} links
        </span>
        <div className="map-zoom">
          <button className="icon-btn" onClick={() => zoomBy(-1)} aria-label="Zoom out" disabled={view?.step === 0}>
            −
          </button>
          <span className="pct" data-testid="map-zoom">
            {Math.round(k * 100)}%
          </span>
          <button className="icon-btn" onClick={() => zoomBy(1)} aria-label="Zoom in" disabled={view?.step === ZOOMS.length - 1}>
            +
          </button>
          <button className="btn" onClick={fitAll}>
            Fit
          </button>
        </div>
      </div>
      <svg
        ref={svg}
        className={`map-svg${lit ? ' lit' : ''}`}
        role="group"
        aria-label="All notes by notebook"
        onPointerDown={onPointerDown}
        onPointerOver={(e) => setHover(idOf(e.target))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => idOf(e.target) && !dragged() && open(idOf(e.target)!)}
        onKeyDown={onKey}
        onFocus={onFocus}
        onBlur={() => setFocus(null)}
      >
        <defs>
          {arrow('mp-arrow')}
          {arrow('mp-arrow-on')}
        </defs>
        {view && (
          <>
            <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
              {areas}
              <g className="mp-edges">{edges}</g>
              {nodes}
              {litNode && (
                <g className="mp-lit">
                  {litEdges.map(([a, b]) => (
                    <path key={`${a}>${b}`} className="mp-edge on" d={edgeD(a, b)} markerEnd="url(#mp-arrow-on)" />
                  ))}
                  <circle className="mp-ring" cx={litNode.x} cy={litNode.y} r={radius(litNode.r) + 3 / k} />
                </g>
              )}
            </g>
            <g className="mp-labels" transform={`translate(${view.x} ${view.y})`} aria-hidden="true">
              {shown.map((b) =>
                b.area ? (
                  <g key={b.id} className="mp-area-t">
                    <circle cx={b.x + 5} cy={b.y + b.h / 2} r={4} style={{fill: w.shelf.colour(b.id.slice(5) || null)}} />
                    <text x={b.x + 14} y={b.y + b.h - 4}>
                      {b.text}
                    </text>
                  </g>
                ) : (
                  <text key={b.id} className={`mp-label${b.id === lit ? ' on' : ''}`} x={b.x + b.w / 2} y={b.y + b.h - 4}>
                    {b.text}
                  </text>
                ),
              )}
            </g>
          </>
        )}
      </svg>
      {empty && <div className="map-empty">No notes yet. Press N for a new one.</div>}
      {litNote && <MapCard w={w} note={litNote} />}
      <div className="map-hint">Scroll or pinch to zoom · drag to pan · arrows move · Enter opens</div>
    </section>
  )
}
