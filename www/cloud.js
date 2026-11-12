// cloud.js — sincronização com o Supabase (1 usuário, login por e-mail/senha).
// Sem bibliotecas: usa fetch direto na API do Supabase (Auth + PostgREST).
// O localStorage continua sendo o cache principal: o app funciona offline e
// sincroniza quando houver internet.

// >>> COLOQUE SUAS CHAVES AQUI (Supabase > Project Settings > API) <<<
const SUPABASE_URL = 'https://abdliioyzkylccfylils.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g6l6_QmwE4Tj85_KF_XHfQ_I4gFlY_n'; // anon/publishable. NUNCA use a service_role.

const AUTH_KEY = 'foco.auth.v1';
const META_KEY = 'foco.sync.v1';
const CHUNK = 500;

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } };

const isConfigured = () => !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_ANON_KEY.startsWith('SUA_');

let session = readJSON(AUTH_KEY);
let meta = Object.assign({ dirty: false, full: false, sessionTs: 0, hash: '', lastSync: 0 }, readJSON(META_KEY));
let ctx = null;        // { getState, apply, onStatus }
let busy = false;
let again = false;
let timer = null;
let status = { state: isConfigured() ? (session ? 'idle' : 'out') : 'unconfigured', msg: '' };

const saveMeta = () => writeJSON(META_KEY, meta);
function setStatus(state, msg = '') {
  status = { state, msg };
  if (ctx && ctx.onStatus) ctx.onStatus(status);
}

/* ---------- Auth (GoTrue REST) ---------- */
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

/* ---------- PostgREST ---------- */
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

async function fetchAll(table, order) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await rest(`${table}?select=*&order=${order}.asc,id.asc&limit=1000&offset=${off}`);
    out.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  return out;
}

const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const inList = (ids) => encodeURIComponent('(' + ids.map((i) => `"${i}"`).join(',') + ')');

/* ---------- Mapeamento app <-> tabelas ---------- */
const taskRow = (t) => ({
  id: t.id, title: t.title, priority: t.priority, project: t.project || '', due: t.due || null,
  done: !!t.done, done_at: t.doneAt || null, created_at: t.createdAt, pomodoros: t.pomodoros || 0,
});
const rowTask = (r) => ({
  id: r.id, title: r.title, priority: r.priority, project: r.project || '', due: r.due || '',
  done: !!r.done, doneAt: r.done_at, createdAt: r.created_at, pomodoros: r.pomodoros,
});
const sessionRow = (s) => ({ id: s.id, task_id: s.taskId || null, minutes: s.minutes, ts: s.ts });
const rowSession = (r) => ({ id: r.id, taskId: r.task_id || null, minutes: r.minutes, ts: r.ts });
const settingsRow = (s) => ({
  user_id: session.user_id, name: s.name || '', focus_min: s.focus, short_min: s.short,
  long_min: s.long, long_every: s.longEvery, sound: !!s.sound, vibrate: !!s.vibrate,
});
const rowSettings = (r) => ({
  name: r.name, focus: r.focus_min, short: r.short_min, long: r.long_min,
  longEvery: r.long_every, sound: r.sound, vibrate: r.vibrate,
});

// "Impressão digital" do que é sincronizado (timer, ciclo etc. ficam só no aparelho).
const lastTs = (st) => st.sessions.reduce((m, s) => Math.max(m, s.ts), 0);
const fingerprint = (st) => JSON.stringify([st.tasks, st.settings, st.sessions.length, lastTs(st)]);

/* ---------- Push / Pull ---------- */
const UPSERT = 'resolution=merge-duplicates,return=minimal';

async function push(st, full) {
  // Tarefas: envia todas e apaga no servidor as que não existem mais aqui.
  for (const c of chunks(st.tasks.map(taskRow), CHUNK)) {
    await rest('tasks?on_conflict=id', { method: 'POST', body: c, prefer: UPSERT });
  }
  const remote = (await rest('tasks?select=id&limit=1000')) || [];
  const keep = new Set(st.tasks.map((t) => t.id));
  const gone = remote.map((r) => r.id).filter((id) => !keep.has(id));
  for (const c of chunks(gone, 100)) await rest(`tasks?id=in.${inList(c)}`, { method: 'DELETE' });

  // Sessões: só envia as novas (append-only); em "full" (importar/apagar) refaz tudo.
  if (full) await rest('sessions?ts=gte.0', { method: 'DELETE' });
  const since = full ? 0 : meta.sessionTs;
  const fresh = st.sessions.filter((s) => s.ts > since).map(sessionRow);
  for (const c of chunks(fresh, CHUNK)) {
    await rest('sessions?on_conflict=id', { method: 'POST', body: c, prefer: 'resolution=ignore-duplicates,return=minimal' });
  }
  meta.sessionTs = lastTs(st);

  await rest('settings?on_conflict=user_id', { method: 'POST', body: [settingsRow(st.settings)], prefer: UPSERT });
}

async function pull() {
  const [tasks, sessions, settings] = await Promise.all([
    fetchAll('tasks', 'created_at'),
    fetchAll('sessions', 'ts'),
    rest('settings?select=*&limit=1'),
  ]);
  return {
    tasks: tasks.map(rowTask),
    sessions: sessions.map(rowSession),
    settings: settings && settings[0] ? rowSettings(settings[0]) : null,
  };
}

async function sync() {
  if (!ctx || !session || !isConfigured()) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    const remote = await pull();
    const remoteEmpty = !remote.tasks.length && !remote.sessions.length && !remote.settings;
    if (meta.dirty || remoteEmpty) {
      // O que está no aparelho vence (alterações pendentes ou nuvem vazia).
      const full = meta.full;
      meta.dirty = false;
      meta.full = false;
      const st = ctx.getState();
      const h = fingerprint(st);
      try { await push(st, full); }
      catch (e) { meta.dirty = true; meta.full = meta.full || full; throw e; }
      meta.hash = h;
    } else {
      ctx.apply(remote); // a nuvem vence
      const st = ctx.getState();
      meta.hash = fingerprint(st);
      meta.sessionTs = lastTs(st);
    }
    meta.lastSync = Date.now();
    saveMeta();
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
  try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignora */ }
  meta = { dirty: false, full: false, sessionTs: 0, hash: '', lastSync: 0 };
  saveMeta();
  setStatus(isConfigured() ? 'out' : 'unconfigured');
}

export const Cloud = {
  isConfigured,
  isLoggedIn: () => !!session,
  email: () => (session && session.email) || '',
  status: () => status,
  lastSync: () => meta.lastSync,

  init(c) { ctx = c; },

  // Chame quando o app abrir: sincroniza e liga os gatilhos automáticos.
  start() {
    if (!session) return;
    sync();
    window.addEventListener('online', () => sync());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  },

  async login(email, password) {
    if (!isConfigured()) throw new Error('Configure as chaves em cloud.js');
    await authRequest('password', { email, password });
    meta = { dirty: false, full: false, sessionTs: 0, hash: '', lastSync: 0 };
    saveMeta();
    setStatus('idle');
  },
  logout,

  // Chamado a cada save(): só marca como pendente se algo sincronizável mudou.
  touch() {
    if (!ctx || !session) return;
    if (fingerprint(ctx.getState()) === meta.hash) return;
    meta.dirty = true;
    saveMeta();
    schedule();
  },
  markFull() { meta.dirty = true; meta.full = true; saveMeta(); },
  sync,
};
