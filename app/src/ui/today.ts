import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {refresh} from '../lib/library'
import {recorded} from '../lib/saver'
import {today} from '../lib/today'
import {makeDay} from '../replica/local'
import type {World} from './world'

export function useToday(w: World, onOpen: (id: string) => void) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  if (!today(new Date(), w.shelf)) return null
  return () => {
    const day = today(new Date(), w.shelf)!
    void recorded(day.id, makeDay(day))
      .then(() => refresh(qc, [day.id]))
      .then(() => navigate({to: '/', search: {n: day.id}}))
      .then(() => onOpen(day.id))
      .catch((e: unknown) => console.warn('today: the note for today could not be opened', e))
  }
}
