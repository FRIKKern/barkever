import {readFileSync, writeFileSync} from 'node:fs'

export const DAILY_TOKENS = 400_000

export type Budget = {left(): number; spend(tokens: number): void}

const localDay = (d: Date) => d.toLocaleDateString('sv')

export function budget(file: string, limit: number, now = () => new Date()): Budget {
  const used = () => {
    try {
      const d = JSON.parse(readFileSync(file, 'utf8')) as {day: string; tokens: number}
      return d.day === localDay(now()) ? d.tokens : 0
    } catch {
      return 0
    }
  }
  return {
    left: () => limit - used(),
    spend: (tokens) => writeFileSync(file, JSON.stringify({day: localDay(now()), tokens: used() + tokens})),
  }
}
