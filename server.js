// Society6 Planning Hub — Replit backend
// Shared source of truth with version-checked saves + permanent row IDs
// (the front-end merges concurrent edits instead of asking who wins).
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('@replit/database');

const db = new Database();
const app = express();
app.use(express.json({ limit: '8mb' }));

// Shared team password — set this in Replit "Secrets" as APP_PASSWORD.
const PASSWORD = process.env.APP_PASSWORD || '';

// --- @replit/database helpers that work across client versions (v2 raw / v3 {ok,value}) ---
async function dbGet(key){
  const r = await db.get(key);
  if (r && typeof r === 'object' && 'ok' in r && 'value' in r) return r.value;
  return r;
}
async function dbSet(key, val){ await db.set(key, val); }
async function dbList(prefix){
  const r = await db.list(prefix);
  if (r && typeof r === 'object' && 'ok' in r && 'value' in r) return r.value || [];
  return r || [];
}
async function dbDel(key){ await db.delete(key); }

const LISTS = ['active','done','backlog','removed'];
const EMPTY = { active:[], done:[], backlog:[], removed:[] };

// Every row carries a permanent _id so all clients agree on which row is which.
// Returns true if any row had to be given one (i.e. the plan changed).
function newId(){
  return (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
}
function ensureIds(plan){
  let changed = false;
  const seen = new Set();
  for (const l of LISTS) {
    if (!Array.isArray(plan[l])) { plan[l] = []; changed = true; }
    for (const row of plan[l]) {
      if (!row || typeof row !== 'object') continue;
      if (!row._id || typeof row._id !== 'string' || seen.has(row._id)) { row._id = newId(); changed = true; }
      seen.add(row._id);
    }
  }
  return changed;
}

// v3 (Oct 2026): the old per-row "status" field was retired — status is now simply
// which list a row is in (Active / Backlog / Done). One-time migration: anything in
// Active that was "Not Started" or "A New Proposal" moves to Backlog, then the old
// field is dropped from every row. Returns the number of rows moved.
const BACKLOG_STATUSES = new Set(['Not Started', 'A New Proposal']);
function migrateStatusV3(plan){
  let moved = 0;
  const keep = [];
  for (const row of plan.active || []) {
    if (row && BACKLOG_STATUSES.has(row.status)) { plan.backlog.push(row); moved++; }
    else keep.push(row);
  }
  plan.active = keep;
  for (const l of LISTS) for (const row of plan[l] || []) { if (row && 'status' in row) delete row.status; }
  return moved;
}

// One-time seed from seed.json (only if the DB is empty), then make sure IDs exist.
async function ensureSeeded(){
  let plan = await dbGet('plan');
  if (plan == null) {
    let seed = EMPTY;
    try { seed = require('./seed.json'); } catch(_) {}
    plan = JSON.parse(JSON.stringify(seed));
    ensureIds(plan);
    await dbSet('plan', plan);
    await dbSet('rev', 0);
    console.log('Seeded initial plan.');
  } else if (ensureIds(plan)) {
    // Migration for plans saved before IDs were persisted.
    await dbSet('plan', plan);
    console.log('Assigned permanent IDs to existing rows.');
  }
  if ((await dbGet('rev')) == null) await dbSet('rev', 0);
  if (!(await dbGet('migrated:v3'))) {
    plan = (await dbGet('plan')) || JSON.parse(JSON.stringify(EMPTY));
    await dbSet('snap:pre-v3', JSON.parse(JSON.stringify(plan)));   // safety copy before the move
    const moved = migrateStatusV3(plan);
    await dbSet('plan', plan);
    await dbSet('rev', Number((await dbGet('rev')) || 0) + 1);
    await dbSet('migrated:v3', new Date().toISOString());
    console.log('v3 migration: moved ' + moved + ' Not Started / New Proposal rows to Backlog; dropped old status field.');
  }
}

function authed(req){
  if (!PASSWORD) return false;
  const given = req.get('x-app-password') || (req.body && req.body.password) || '';
  return given === PASSWORD;
}

app.post('/api/login', (req, res) => {
  const given = (req.body && req.body.password) || '';
  res.json({ ok: !!PASSWORD && given === PASSWORD });
});

app.get('/api/data', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ ok:false, error:'unauthorized' });
  const data = (await dbGet('plan')) || JSON.parse(JSON.stringify(EMPTY));
  if (ensureIds(data)) await dbSet('plan', data);   // belt-and-braces
  const rev = Number((await dbGet('rev')) || 0);
  res.json({ ok:true, data, rev });
});

// Serialize saves so two requests can't interleave (belt; the rev-check is the real guarantee)
let saveChain = Promise.resolve();
app.post('/api/save', (req, res) => {
  if (!authed(req)) return res.status(401).json({ ok:false, error:'unauthorized' });
  saveChain = saveChain.then(() => handleSave(req, res)).catch(err => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ ok:false, error:'server error' });
  });
});

async function handleSave(req, res){
  const body = req.body || {};
  const data = body.data;
  const baseRev = Number(body.baseRev);
  if (!data || !('active' in data)) { res.status(400).json({ ok:false, error:'bad payload' }); return; }
  const curRev = Number((await dbGet('rev')) || 0);
  if (!isNaN(baseRev) && baseRev !== curRev) {
    // Someone else saved since this client loaded — reject and return the current copy.
    // The front-end merges its changes onto this copy and re-saves.
    const current = (await dbGet('plan')) || EMPTY;
    res.json({ ok:false, conflict:true, rev:curRev, data:current });
    return;
  }
  ensureIds(data);   // any row that arrives without an ID gets one
  // A pre-v3 backup restored via Import still carries the old status field — migrate it too.
  if (LISTS.some(l => (data[l] || []).some(r => r && 'status' in r))) {
    const moved = migrateStatusV3(data);
    console.log('v3 migration (on import): moved ' + moved + ' rows to Backlog; dropped old status field.');
  }
  await dbSet('plan', data);
  const newRev = curRev + 1;
  await dbSet('rev', newRev);
  // daily snapshot (overwrite same day), keep the last 14 days
  const day = new Date().toISOString().slice(0,10);
  await dbSet('snap:' + day, data);
  try {
    const snaps = (await dbList('snap:')).filter(k => /^snap:\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    while (snaps.length > 14) { await dbDel(snaps.shift()); }
  } catch(_) {}
  res.json({ ok:true, rev:newRev, data });
}

// Static front-end
app.use(express.static(path.join(__dirname, 'public')));
// SPA fallback (works on Express 4 and 5)
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
ensureSeeded()
  .then(() => app.listen(PORT, () => console.log('Planning Hub running on port ' + PORT)))
  .catch(err => { console.error('Startup error', err); process.exit(1); });
