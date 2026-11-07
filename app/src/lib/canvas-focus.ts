import {holdsNothing, type Block} from './model'

type FocusCanvas = {
  focusSelection?: () => boolean
  querySelector: (selector: string) => {focus: () => void} | null
}

export function focusCanvas(canvas: FocusCanvas | null): boolean | void {
  if (typeof canvas?.focusSelection === 'function') return canvas.focusSelection()
  canvas?.querySelector('.ProseMirror')?.focus()
}

export function typeHeld(held: string) {
  held.split('\n').forEach((line, i) => {
    if (i) document.execCommand('insertParagraph')
    if (line) document.execCommand('insertText', false, line)
  })
}

export const heldBlocks = (held: string, blocks: Block[]): Block[] => [
  ...held
    .split('\n')
    .filter((line) => line.trim())
    .map((value): Block => ({id: crypto.randomUUID(), type: 'paragraph', content: [{type: 'text', value}]})),
  ...blocks.filter((b, i) => i > 0 || !holdsNothing(b)),
]
