const inline = (c = []) => c.map((x) => (x.type === 'text' ? x.value : inline(x.children))).join('')

export const bodyText = (body) =>
  (body?.blocks ?? []).map((b) => b.text ?? (b.items ? b.items.map((i) => inline(i.content ?? i)).join('\n') : inline(b.content))).join('\n')

export const textBody = (id, text) => ({
  blocks: text.split('\n').map((line, i) => ({ id: `${id}-e${i}`, type: 'paragraph', content: [{ type: 'text', value: line }] })),
})

export const searchText = (n) => `${n.title}\n${bodyText(n.body)}`.toLowerCase()
