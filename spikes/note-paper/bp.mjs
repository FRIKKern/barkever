// Tiny Barkpark HTTP client for the spike. Reads the token inside the
// process and never prints it. Scope is pinned to barkever / spike-note-b.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8'));
export const BASE = cfg.server;
export const WS = 'barkever', PROJ = 'default', DS = 'spike-note-b';
export const P = `/w/${WS}/p/${PROJ}`;
if (DS !== 'spike-note-b' || WS !== 'barkever') throw new Error('scope guard');

export async function req(method, path, body, { auth = true } = {}) {
  const headers = { 'content-type': 'application/json',
    'x-barkpark-workspace': WS, 'x-barkpark-project': PROJ };
  if (auth) headers.authorization = `Bearer ${cfg.token}`;
  const t0 = performance.now();
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const ms = performance.now() - t0;
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 400); }
  return { status: res.status, ms, json };
}

// Core data API (scoped) and the paper ops door.
export const doc = (type, id, persp = 'drafts') =>
  req('GET', `${P}/v1/data/doc/${DS}/${type}/${encodeURIComponent(id)}?perspective=${persp}`);
export const mutate = (mutations, extra = {}) => req('POST', `${P}/v1/data/mutate/${DS}`, { mutations, ...extra });
// The flat Bulldocs door (/v1/plugins/bulldocs/papers/:slug/ops) is ingest-tier and
// has no scope segment: with a Default-bound token it can only see the Default
// workspace (404 "no paper for slug" here, and `bp bulldocs patch -w barkever`
// refuses outright). The member-token, workspace-scoped door is this one.
export const paperOps = (slug, ops, ifRev, requestId) =>
  req('POST', `${P}/v1/papers/${encodeURIComponent(slug)}/ops`,
    { ops, dataset: DS, ...(ifRev === undefined ? {} : { ifRev }), ...(requestId ? { requestId } : {}) });

export const show = (label, r, n = 1800) =>
  console.log(`\n## ${label} -> HTTP ${r.status} (${r.ms.toFixed(0)} ms)\n` + JSON.stringify(r.json, null, 1).slice(0, n));
