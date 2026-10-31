import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'
import {bridge} from '../lib/ask'
import {THEME_KEY} from '../styles/tokens'

const RAIL_KEY = 'barkever.rail'
const AI_KEY = 'barkever.ai'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}

export function toggleTheme() {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  root.dataset.theme = dark ? 'light' : 'dark'
  write(THEME_KEY, root.dataset.theme)
}

export function useRail(): [boolean | null, () => void] {
  const [rail, setRail] = useState<boolean | null>(null)
  useEffect(() => {
    const v = read(RAIL_KEY)
    if (v) setRail(v === 'open')
  }, [])
  const toggle = useCallback(() => {
    const shown = rail ?? innerWidth > 1180
    write(RAIL_KEY, shown ? 'closed' : 'open')
    setRail(!shown)
  }, [rail])
  return [rail, toggle]
}

const aiWatchers = new Set<() => void>()
let aiOn = true

const setAiOn = (on: boolean) => {
  aiOn = on
  void bridge()?.setAi(on)
  aiWatchers.forEach((w) => w())
}

const watchAi = (w: () => void) => (aiWatchers.add(w), () => void aiWatchers.delete(w))

export function useAi(): [boolean, () => void] {
  const on = useSyncExternalStore(watchAi, () => aiOn, () => true)
  useEffect(() => setAiOn(read(AI_KEY) !== 'off'), [])
  const toggle = useCallback(() => {
    write(AI_KEY, aiOn ? 'off' : 'on')
    setAiOn(!aiOn)
  }, [])
  return [on, toggle]
}
