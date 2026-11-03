type FocusCanvas = {
  focusSelection?: () => boolean
  querySelector: (selector: string) => {focus: () => void} | null
}

export function focusCanvas(canvas: FocusCanvas | null): boolean | void {
  if (typeof canvas?.focusSelection === 'function') return canvas.focusSelection()
  canvas?.querySelector('.ProseMirror')?.focus()
}
