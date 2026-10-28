// Tiny Barkpark HTTP client for the sync-pull spike.
// The token is read from ~/.config/barkpark/config.json and never printed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync(join(homedir(), '.config/barkpark/config.json'), 'utf8'));
const SERVER = process.env.BP_SERVER || cfg.server;
const TOKEN = cfg.token; // never log
export const WS = 'barkever';
export const PROJECT = 'default';
export const DATASET = 'spike-sync-d'; // the only dataset this spike may touch
export const TYPE = 'spikeNote';
const BASE = `${SERVER}/w/${WS}/p/${PROJECT}`;

export const stats = { requests: 0, reads: 0, writes: 0, retries429: 0, bytes: 0 };
export function resetStats() {
  for (const k of Object.keys(stats)) stats[k] = 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, path, { body, query, raw = false } = {}) {
  const url = new URL(BASE + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.append(k, String(v));
  for (let attempt = 0; ; attempt++) {
    stats.requests++;
    if (method === 'GET') stats.reads++;
    else stats.writes++;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    stats.bytes += text.length;
    if (res.status === 429 && attempt < 8) {
      stats.retries429++;
      const ra = Number(res.headers.get('retry-after') || '5');
      await sleep((ra + 1) * 1000);
      continue;
    }
    if (!res.ok) {
      const err = new Error(`${method} ${url.pathname}${url.search} -> ${res.status}: ${text.slice(0, 400)}`);
      err.status = res.status;
      throw err;
    }
    return raw ? text : JSON.parse(text);
  }
}

// GET /v1/data/query/:dataset/:type  (api-v1.md §4)
export function query(params) {
  return http('GET', `/v1/data/query/${DATASET}/${TYPE}`, { query: params });
}

// GROQ (contracts/groq-query.md)
export function groq(q, params = {}, perspective = 'raw') {
  return http('POST', `/v2025-02-19/data/query/${DATASET}`, {
    body: { query: q, params },
    query: { perspective },
  }).then((r) => {
    stats.writes--; // POST GROQ bills the read bucket
    stats.reads++;
    return r;
  });
}

// POST /v1/data/mutate/:dataset  (api-v1.md §6)
export function mutate(mutations) {
  return http('POST', `/v1/data/mutate/${DATASET}`, { body: { mutations } });
}

// Server truth: every row of the type, raw perspective, one NDJSON request.
export async function exportAll() {
  const text = await http('GET', `/v1/data/export/${DATASET}`, {
    query: { type: TYPE, perspective: 'raw' },
    raw: true,
  });
  const docs = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const d = JSON.parse(line);
    if (d._barkpark_export) throw new Error('export incomplete: ' + line);
    docs.push(d);
  }
  return docs;
}

// GET /v1/data/analytics/:dataset (`bp dataset stats`): last 50 mutation_events,
// newest first, deletes included. Content.Analytics.recent_activity/2.
export function dataset_stats() {
  return http('GET', `/v1/data/analytics/${DATASET}`);
}

export function history(docId, params = {}) {
  return http('GET', `/v1/data/history/${DATASET}/${TYPE}/${encodeURIComponent(docId)}`, { query: params });
}
