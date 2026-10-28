// Generates N valid mutations against a model of server state and sends them in
// atomic mutate batches. Model: id -> { draft: bool, published: bool }.
import * as bp from './bp.mjs';

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

export class Model {
  constructor() {
    this.docs = new Map();
    this.n = 0;
  }
  // rebuild from server truth rows
  static fromRows(rows) {
    const m = new Model();
    for (const d of rows) {
      const id = d._id.replace(/^drafts\./, '');
      const e = m.docs.get(id) || { draft: false, published: false };
      if (d._id.startsWith('drafts.')) e.draft = true;
      else e.published = true;
      m.docs.set(id, e);
    }
    m.n = m.docs.size;
    return m;
  }
  ids(pred) {
    return [...this.docs].filter(([, e]) => pred(e)).map(([id]) => id);
  }
}

const KINDS = [
  ['create', 25],
  ['editDraft', 20],
  ['editPublished', 10], // createOrReplace over a published doc -> forks a draft
  ['directPublish', 5], // createOrReplace + publish:true
  ['publish', 10],
  ['unpublish', 8],
  ['discardDraft', 7],
  ['delete', 15],
];
const TOTAL = KINDS.reduce((s, [, w]) => s + w, 0);
function pickKind() {
  let x = rand() * TOTAL;
  for (const [k, w] of KINDS) if ((x -= w) < 0) return k;
  return 'create';
}

// One mutation, or null if the model has no valid target. Each touched id is
// used at most once per batch (keeps every batch valid against the model).
function next(model, tag, used) {
  const free = (pred) => model.ids((e) => pred(e)).filter((id) => !used.has(id));
  const T = bp.TYPE;
  for (let tries = 0; tries < 20; tries++) {
    const kind = pickKind();
    const body = `${tag}-${model.n}-${Math.floor(rand() * 1e9)}`;
    if (kind === 'create') {
      const id = `${tag}-${model.n++}`;
      used.add(id);
      model.docs.set(id, { draft: true, published: false });
      return [kind, { create: { _id: id, _type: T, title: `Note ${id}`, body, seq: model.n } }];
    }
    if (kind === 'editDraft') {
      const c = free((e) => e.draft);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      return [kind, { patch: { id: `drafts.${id}`, type: T, set: { body } } }];
    }
    if (kind === 'editPublished') {
      const c = free((e) => e.published && !e.draft);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      model.docs.get(id).draft = true;
      return [kind, { createOrReplace: { _id: id, _type: T, title: `Note ${id}`, body } }];
    }
    if (kind === 'directPublish') {
      const c = free(() => true);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      Object.assign(model.docs.get(id), { draft: false, published: true });
      return [kind, { createOrReplace: { _id: id, _type: T, title: `Note ${id}`, body }, publish: true }];
    }
    if (kind === 'publish') {
      const c = free((e) => e.draft);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      Object.assign(model.docs.get(id), { draft: false, published: true });
      return [kind, { publish: { id, type: T } }];
    }
    if (kind === 'unpublish') {
      const c = free((e) => e.published);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      Object.assign(model.docs.get(id), { draft: true, published: false });
      return [kind, { unpublish: { id, type: T } }];
    }
    if (kind === 'discardDraft') {
      const c = free((e) => e.draft && e.published);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      model.docs.get(id).draft = false;
      return [kind, { discardDraft: { id, type: T } }];
    }
    if (kind === 'delete') {
      const c = free(() => true);
      if (!c.length) continue;
      const id = pick(c);
      used.add(id);
      model.docs.delete(id);
      return [kind, { delete: { id, type: T } }];
    }
  }
  return null;
}

// Apply N changes on the server. Returns kind counts.
export async function makeChanges(model, n, { tag, batch = 100 } = {}) {
  const counts = {};
  let left = n;
  while (left > 0) {
    const used = new Set();
    const muts = [];
    while (muts.length < Math.min(batch, left)) {
      const m = next(model, tag, used);
      if (!m) break;
      counts[m[0]] = (counts[m[0]] || 0) + 1;
      muts.push(m[1]);
    }
    await bp.mutate(muts);
    left -= muts.length;
  }
  return counts;
}

export async function seed(n, tag) {
  const model = new Model();
  for (let i = 0; i < n; i += 100) {
    const muts = [];
    for (let j = i; j < Math.min(n, i + 100); j++) {
      const id = `${tag}-${j}`;
      // half published, half drafts
      const doc = { _id: id, _type: bp.TYPE, title: `Seed ${j}`, body: `seed body ${j}`, seq: j };
      if (j % 2 === 0) {
        muts.push({ createOrReplace: doc, publish: true });
        model.docs.set(id, { draft: false, published: true });
      } else {
        muts.push({ create: doc });
        model.docs.set(id, { draft: true, published: false });
      }
    }
    await bp.mutate(muts);
  }
  model.n = n;
  return model;
}
