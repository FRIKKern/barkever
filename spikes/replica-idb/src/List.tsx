import {memo, useLayoutEffect, useRef} from 'react'
import {useVirtualizer} from '@tanstack/react-virtual'
import {settle, wait} from './metrics'
import type {Row} from './data'

const ListRow = memo(function ListRow({row, active, nb, onOpen}: {row: Row; active: boolean; nb?: string; onOpen: (id: string) => void}) {
  useLayoutEffect(() => {
    const ks = wait.ks
    if (ks?.value === row.title) (wait.ks = undefined), settle('ksList', ks.t0)
  }, [row.title])
  return (
    <div data-id={row.id} onClick={() => onOpen(row.id)} style={{height: 22, overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: active ? 'bold' : undefined}}>
      {row.title || 'Untitled'} · {nb}
    </div>
  )
})

export function List({rows, selected, onOpen, nbs}: {rows: Row[]; selected: string | null; onOpen: (id: string) => void; nbs?: Map<string, string>}) {
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({count: rows.length, getScrollElement: () => ref.current, estimateSize: () => 22, overscan: 10})
  return (
    <div ref={ref} style={{height: 600, width: 420, overflow: 'auto'}}>
      <div style={{height: v.getTotalSize(), position: 'relative'}}>
        {v.getVirtualItems().map((it) => {
          const row = rows[it.index]
          return (
            <div key={row.id} style={{position: 'absolute', top: it.start, left: 0, right: 0}}>
              <ListRow row={row} active={row.id === selected} nb={nbs?.get(row.notebook)} onOpen={onOpen} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
