import {useRef, useState, type DragEvent} from 'react'
import {exportNotebook, type Import} from './markdown-files'
import {Icon} from './icons'
import type {World} from './world'

export function ListFiles({w, nb, io}: {w: World; nb?: string; io: Import}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="list-files">
      <input
        ref={input}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        multiple
        hidden
        onChange={(e) => (io.start([...(e.target.files ?? [])]), (e.target.value = ''))}
        data-testid="import-input"
      />
      <button className="icon-btn" onClick={() => input.current?.click()} title="Import Markdown…" aria-label="Import Markdown…" data-testid="import-markdown">
        <Icon name="upload" />
      </button>
      {nb && (
        <button className="icon-btn" onClick={() => exportNotebook(nb, w)} title="Export notebook" aria-label="Export notebook" data-testid="export-notebook">
          <Icon name="download" />
        </button>
      )}
    </span>
  )
}

export const ImportLine = ({io}: {io: Import}) =>
  io.line && (
    <div className="import-line" role="status" data-testid="import-line">
      <span>{io.line}</span>
      <button className="icon-btn" onClick={io.clear} aria-label="Dismiss">
        ×
      </button>
    </div>
  )

const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')

export function useDropFiles(io: Import) {
  const [over, setOver] = useState(false)
  return {
    over,
    on: {
      onDragOver: (e: DragEvent) => carriesFiles(e) && (e.preventDefault(), setOver(true)),
      onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false),
      onDrop: (e: DragEvent) => {
        if (!carriesFiles(e)) return
        e.preventDefault()
        setOver(false)
        io.start([...e.dataTransfer.files])
      },
    },
  }
}
