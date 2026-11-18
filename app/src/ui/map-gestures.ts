import {useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject} from 'react'
import {ZOOMS} from '../lib/map-layout'

export type View = {x: number; y: number; step: number}
type Point = {x: number; y: number}

const PER_STEP = Math.log(2) / 3
const WHEEL_STEP = 80
const DRAG_PX = 4

export const clampStep = (step: number) => Math.min(Math.max(step, 0), ZOOMS.length - 1)

export function zoomAt(v: View, step: number, p: Point): View {
  const to = clampStep(step)
  const f = ZOOMS[to] / ZOOMS[v.step]
  return {step: to, x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f}
}

export function useGestures(svg: RefObject<SVGSVGElement | null>, view: View | null, setView: (v: View) => void) {
  const latest = useRef(view)
  latest.current = view
  const moved = useRef(false)
  const points = useRef(new Map<number, Point>())
  const start = useRef<{view: View; c: Point; d: number} | null>(null)

  const local = (e: {clientX: number; clientY: number}): Point => {
    const r = svg.current!.getBoundingClientRect()
    return {x: e.clientX - r.left, y: e.clientY - r.top}
  }
  const spread = () => {
    const ps = [...points.current.values()]
    const c = {x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length}
    return {c, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0}
  }
  const anchor = () => {
    start.current = latest.current && points.current.size ? {view: latest.current, ...spread()} : null
  }

  useEffect(() => {
    const el = svg.current
    if (!el) return
    let wheel = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = latest.current
      if (!v) return
      wheel += e.deltaY * (e.ctrlKey ? 4 : 1)
      if (Math.abs(wheel) < WHEEL_STEP) return
      const step = v.step - Math.sign(wheel)
      wheel = 0
      setView(zoomAt(v, step, local(e)))
    }
    const onMove = (e: PointerEvent) => {
      if (!points.current.has(e.pointerId) || !start.current) return
      points.current.set(e.pointerId, local(e))
      const {c, d} = spread()
      const s = start.current
      if (points.current.size > 1 || Math.abs(c.x - s.c.x) + Math.abs(c.y - s.c.y) > DRAG_PX) moved.current = true
      if (!moved.current) return
      const panned = {...s.view, x: s.view.x + c.x - s.c.x, y: s.view.y + c.y - s.c.y}
      setView(d && s.d ? zoomAt(panned, s.view.step + Math.round(Math.log(d / s.d) / PER_STEP), c) : panned)
    }
    const onUp = (e: PointerEvent) => {
      if (points.current.delete(e.pointerId)) anchor()
    }
    el.addEventListener('wheel', onWheel, {passive: false})
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onUp)
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!points.current.size) moved.current = false
    points.current.set(e.pointerId, local(e))
    anchor()
  }
  return {onPointerDown, dragged: () => moved.current}
}
