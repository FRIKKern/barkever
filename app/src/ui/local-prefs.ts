import {useCallback, useEffect, useState} from 'react'
import {THEME_KEY} from '../styles/tokens'

const RAIL_KEY = 'barkever.rail'

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
