import {useEffect, useRef} from 'react'
import {useLocation, useRouter} from '@tanstack/react-router'
import type {Search} from '../lib/scope'

const visited = new Map<number, Search>()
const listOf = ({nb, tag, q}: Search): Search => ({nb, tag, q})
const sameList = (a: Search, b: Search) => !a.n && a.nb === b.nb && a.tag === b.tag && a.q === b.q

export function useBackStep(s: Search) {
  const router = useRouter()
  const at = useLocation({select: (l) => l.state.__TSR_index})
  useEffect(() => void visited.set(at, s), [at, s])
  return () => {
    const prev = visited.get(at - 1)
    if (prev && sameList(prev, s)) router.history.back()
    else void router.navigate({to: '/', search: listOf(s), replace: true})
  }
}

export function useLeave(id: string | undefined, onLeave: (left: string) => void) {
  const shown = useRef(id)
  useEffect(() => {
    const left = shown.current
    shown.current = id
    if (left && left !== id) onLeave(left)
  }, [id])
}
