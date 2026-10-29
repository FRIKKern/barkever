import type {Block} from '../lib/model'

export type BlockOp = {op: string; id?: string; afterId?: string; after?: string | null; block?: Block; patch?: Partial<Block>}

function insertAfter(blocks: Block[], after: string | null, block: Block): Block[] {
  const rest = blocks.filter((b) => b.id !== block.id)
  const at = after === null ? 0 : rest.findIndex((b) => b.id === after) + 1 || rest.length
  return [...rest.slice(0, at), block, ...rest.slice(at)]
}

const before = (after: Block[], id: string) => after[after.findIndex((b) => b.id === id) - 1]?.id ?? null

function step(blocks: Block[], o: BlockOp, after: Block[]): Block[] {
  if (o.op === 'remove-block') return blocks.filter((b) => b.id !== o.id)
  if (o.op === 'append-block' && o.block) return [...blocks.filter((b) => b.id !== o.block!.id), o.block]
  if (o.op === 'insert-after' && o.block) return insertAfter(blocks, o.afterId ?? null, o.block)
  if (o.op === 'move-block') {
    const b = blocks.find((x) => x.id === o.id)
    return b ? insertAfter(blocks, o.after ?? null, b) : blocks
  }
  const id = o.id ?? o.block?.id
  const fresh = after.find((b) => b.id === id)
  if (!fresh) return blocks
  if (!blocks.some((b) => b.id === id)) return insertAfter(blocks, before(after, fresh.id), fresh)
  if (o.op === 'patch-block' && o.patch) return blocks.map((b) => (b.id === id ? {...b, ...o.patch} : b))
  return blocks.map((b) => (b.id === id ? fresh : b))
}

export const applyOps = (blocks: Block[], ops: BlockOp[], after: Block[]): Block[] => ops.reduce((bs, o) => step(bs, o, after), blocks)
