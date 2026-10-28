// 08: the smallest real host for <bp-paper-canvas>. The browser never talks to
// Barkpark (decision 0003): it talks to this server, which holds the token.
//   GET  /             the host page
//   GET  /api/note?id  { title, rev, blocks } of drafts.<id>
//   POST /api/ops      { id, ops, ifRev } -> scoped member-token ops door
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { doc, paperOps } from '../bp.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url));
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(JSON.parse(s || '{}'))); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
  if (url.pathname === '/api/note') {
    const r = await doc('paper', `drafts.${url.searchParams.get('id')}`);
    const d = r.json.result;
    return r.status === 200 ? json(res, 200, { title: d.title, rev: d.rev ?? 0, blocks: d.blocks }) : json(res, r.status, r.json);
  }
  if (url.pathname === '/api/ops' && req.method === 'POST') {
    const { id, ops, ifRev } = await body(req);
    const r = await paperOps(`drafts.${id}`, ops, ifRev);
    console.log(`ops ${ops.map(o => o.op).join(',')} ifRev=${ifRev} -> ${r.status} ${r.json.rev ?? r.json.error?.code}`);
    return json(res, r.status, r.json);
  }
  json(res, 404, { error: 'not found' });
}).listen(4317, '127.0.0.1', () => console.log('canvas host on http://127.0.0.1:4317'));
