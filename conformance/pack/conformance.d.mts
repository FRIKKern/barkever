export const MISSING: unique symbol

export type Golden = {type: string; input: unknown; expectedHtml: string}
export type Verdict = typeof MISSING | string[] | {via?: string; diff: string[]}
export type Row = {type: string; status: 'pass' | 'fail' | 'missing' | 'unchecked'; via?: string; diff?: string[]}
export type Report = {renderer: string; compare: string; pack_stamp: string; ran_at_sha: string; rows: Row[]}

export function conform(options: {renderer: string; compare: string; judge: (golden: Golden) => Verdict | Promise<Verdict>; pack?: string}): Promise<Report>
export function counts(report: Report): {pass: number; fail: number; missing: number; unchecked: number}
export function diffShapes(actual: unknown[], golden: unknown[]): string[]
export function modeFromEnv(): {write: boolean; strict: boolean}
export function settle(report: Report, options?: {write?: boolean; strict?: boolean; path?: string}): string[]
export function shapeOf(nodes: NodeList): unknown[]
