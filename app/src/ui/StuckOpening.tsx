import {useEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {libraryQuery} from '../lib/library'
import {SignOut} from './SignOut'

const STUCK_AFTER_MS = 5000

export function StuckOpening() {
  const [late, setLate] = useState(false)
  const {data: library} = useQuery({...libraryQuery, enabled: false})
  useEffect(() => {
    const t = setTimeout(() => setLate(true), STUCK_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  if (!late || library) return null
  return (
    <main className="stuck-opening" role="status" data-testid="stuck-opening">
      <p>Your notes aren’t opening on this device yet. Close other Barkever tabs or restart the browser if this stays.</p>
      <SignOut />
    </main>
  )
}
