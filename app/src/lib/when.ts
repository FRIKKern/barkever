export function when(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  const day = (x: Date) => +new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diff = Math.round((day(now) - day(d)) / 864e5)
  if (diff <= 0) return d.toTimeString().slice(0, 5)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-GB', {weekday: 'short'})
  return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})
}
