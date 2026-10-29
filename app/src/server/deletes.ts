export type Delete = {delete: {id: string; type: string; ifRevisionID?: string; force?: boolean}}
export type Row = {_id: string; _rev: string}

export const isDelete = (m: unknown): m is Delete => !!(m as Partial<Delete> | undefined)?.delete?.id

const bare = (id: string) => id.replace(/^drafts\./, '')

export function exactDeletes({delete: {id, type, ifRevisionID, force}}: Delete, rows: Map<string, Row>): Delete[] {
  const [draft, published] = [rows.get(`drafts.${bare(id)}`), rows.get(bare(id))]
  const seen = draft ?? published
  return [draft, published].flatMap((row) => (row ? [{delete: {id: row._id, type, ifRevisionID: row === seen ? (ifRevisionID ?? row._rev) : row._rev, ...(force && {force})}}] : []))
}
