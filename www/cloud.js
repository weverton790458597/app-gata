import { SCHEMA, snake, rec } from './storage.js';
const SUPABASE_URL = 'https://xtkdvbtfwywrepkvskth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OnunHnBQLHTblyjZqdyAQw_xi_yCWJj';
const AUTH_KEY = 'psi.auth.v1';
const META_KEY = 'psi.sync.v1';
const CHUNK = 100;
const UPSERT = 'resolution=merge-duplicates,return=minimal';
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const isConfigured = () => !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.startsWith('SUA_');
const freshMeta = () => ({ dirty: {}, del: {}, settings: false, since: {}, lastSync: 0 });
let session = readJSON(AUTH_KEY);
let meta = Object.assign(freshMeta(), readJSON(META_KEY));
let ctx = null;
let busy = false;
let again = false;
let timer = null;
let started = false;
let status = { state: isConfigured() ? (session ? 'idle' : 'out') : 'unconfigured', msg: '' };
const saveMeta = () => writeJSON(META_KEY, meta);
function setStatus(state, msg = '') {
  status = { state, msg };
  if (ctx && ctx.onStatus) ctx.onStatus(status);
}
async function authRequest(grant, body) {
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) { throw new Error('Sem conexão com a internet'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 400 ? 'E-mail ou senha incorretos' : (j.error_description || j.msg || 'Falha no login'));
    e.status = r.status;
    throw e;
  }
  session = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600),
    user_id: (j.user && j.user.id) || (session && session.user_id),
    email: (j.user && j.user.email) || (session && session.email),
  };
  writeJSON(AUTH_KEY, session);
}
async function token() {
  if (!session) throw new Error('Sem login');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try { await authRequest('refresh_token', { refresh_token: session.refresh_token }); }
    catch (e) {
      if (e.status === 400 || e.status === 401 || e.status === 403) logout();
      throw e;
    }
  }
  return session.access_token;
}
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const t = await token();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: Object.assign(
      { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      prefer ? { Prefer: prefer } : {}
    ),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || `Erro ${r.status}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const inList = (ids) => encodeURIComponent('(' + ids.map((i) => `"${i}"`).join(',') + ')');
const toRow = (e, r) => {
  const o = { id: r.id, created_at: new Date(r.createdAt || Date.now()).toISOString() };
  for (const [k, t] of Object.entries(SCHEMA[e].f)) {
    const v = r[k];
    o[snake(k)] = t === 'd' || t === 't' || t === 'i' ? (v || null) : t === 'j' ? (v || []) : v;
  }
  return o;
};
const fromRow = (e, row) => {
  const raw = { id: row.id, createdAt: Date.parse(row.created_at) };
  Object.keys(SCHEMA[e].f).forEach((k) => { raw[k] = row[snake(k)]; });
  return rec(e, raw);
};
const settingsRow = (s) => ({
  user_id: session.user_id, name: s.name || '', crp: s.crp || '', clinic: s.clinic || '',
  session_min: s.sessionMin, notify_min: s.notifyMin, sound: !!s.sound, vibrate: !!s.vibrate,
});
const rowSettings = (r) => ({
  name: r.name || '', crp: r.crp || '', clinic: r.clinic || '',
  sessionMin: r.session_min, notifyMin: r.notify_min, sound: r.sound, vibrate: r.vibrate,
});
const add = (map, e, id) => { const l = map[e] || (map[e] = []); if (!l.includes(id)) l.push(id); };
const pendingCount = () =>
  Object.values(meta.dirty).reduce((a, l) => a + l.length, 0) +
  Object.values(meta.del).reduce((a, l) => a + l.length, 0) + (meta.settings ? 1 : 0);
async function sync() {
  if (!ctx || !session || !isConfigured()) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    for (const e of Object.keys(SCHEMA)) {
      const table = SCHEMA[e].table;
      const ids = meta.dirty[e] || [];
      if (ids.length) {
        meta.dirty[e] = [];
        try {
          const set = new Set(ids);
          const rows = ctx.getState()[e].filter((r) => set.has(r.id)).map((r) => toRow(e, r));
          for (const c of chunks(rows, CHUNK)) await rest(`${table}?on_conflict=id`, { method: 'POST', body: c, prefer: UPSERT });
        } catch (x) {
          (meta.dirty[e] = meta.dirty[e] || []);
          ids.forEach((id) => add(meta.dirty, e, id));
          throw x;
        }
      }
      const gone = meta.del[e] || [];
      if (gone.length) {
        meta.del[e] = [];
        try {
          for (const c of chunks(gone, CHUNK)) await rest(`${table}?id=in.${inList(c)}`, { method: 'PATCH', body: { deleted_at: new Date().toISOString() }, prefer: 'return=minimal' });
        } catch (x) {
          gone.forEach((id) => add(meta.del, e, id));
          throw x;
        }
      }
    }
    if (meta.settings) {
      meta.settings = false;
      try { await rest('settings?on_conflict=user_id', { method: 'POST', body: [settingsRow(ctx.getState().settings)], prefer: UPSERT }); }
      catch (x) { meta.settings = true; throw x; }
    }
    let changed = false;
    for (const e of Object.keys(SCHEMA)) {
      const since = meta.since[e] || '1970-01-01T00:00:00Z';
      const skip = new Set(meta.dirty[e] || []);
      const up = [];
      const rm = [];
      let last = since;
      for (let off = 0; ; off += 1000) {
        const page = (await rest(`${SCHEMA[e].table}?select=*&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.asc,id.asc&limit=1000&offset=${off}`)) || [];
        page.forEach((r) => {
          if (Date.parse(r.updated_at) > Date.parse(last)) last = r.updated_at;
          if (skip.has(r.id)) return;
          if (r.deleted_at) rm.push(r.id); else up.push(fromRow(e, r));
        });
        if (page.length < 1000) break;
      }
      if (up.length || rm.length) { ctx.merge(e, up, rm); changed = true; }
      meta.since[e] = last;
    }
    if (!meta.settings) {
      const s = await rest('settings?select=*&limit=1');
      if (s && s[0]) { ctx.setSettings(rowSettings(s[0])); changed = true; }
    }
    meta.lastSync = Date.now();
    saveMeta();
    if (changed && ctx.done) ctx.done();
    setStatus('ok');
  } catch (e) {
    saveMeta();
    setStatus(e instanceof TypeError ? 'offline' : 'error', e.message);
  } finally {
    busy = false;
    if (again) { again = false; schedule(500); }
  }
}
function schedule(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}
function logout() {
  session = null;
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  meta = freshMeta();
  saveMeta();
  setStatus(isConfigured() ? 'out' : 'unconfigured');
}
export const Cloud = {
  isConfigured,
  isLoggedIn: () => !!session,
  email: () => (session && session.email) || '',
  status: () => status,
  lastSync: () => meta.lastSync,
  pending: pendingCount,
  init(c) { ctx = c; },
  start() {
    if (!session) return;
    sync();
    if (started) return;
    started = true;
    window.addEventListener('online', () => sync());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  },
  async login(email, password) {
    if (!isConfigured()) throw new Error('Configure as chaves em cloud.js');
    await authRequest('password', { email, password });
    meta = freshMeta();
    saveMeta();
    setStatus('idle');
  },
  logout,
  mark(e, id) {
    const l = meta.del[e];
    if (l) meta.del[e] = l.filter((x) => x !== id);
    add(meta.dirty, e, id);
    saveMeta();
    if (session) schedule();
  },
  del(e, id) {
    if (meta.dirty[e]) meta.dirty[e] = meta.dirty[e].filter((x) => x !== id);
    add(meta.del, e, id);
    saveMeta();
    if (session) schedule();
  },
  markSettings() { meta.settings = true; saveMeta(); if (session) schedule(); },
  markAll(state) {
    Object.keys(SCHEMA).forEach((e) => state[e].forEach((r) => add(meta.dirty, e, r.id)));
    saveMeta();
    if (session) schedule(300);
  },
  delAll(state) {
    Object.keys(SCHEMA).forEach((e) => state[e].forEach((r) => Cloud.del(e, r.id)));
  },
  sync,
};
