// storage.js — persistência local (localStorage) com validação e versionamento.
// Funciona dentro do WebView do Capacitor/Cordova e no navegador.

const KEY = 'foco.app.v1';
const PRIORITIES = ['alta', 'media', 'baixa'];
const MODES = ['focus', 'short', 'long'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let memoryFallback = null; // usado se o localStorage estiver indisponível

export function defaults() {
  return {
    v: 1,
    tasks: [],
    sessions: [],
    cycle: 0,
    activeTaskId: null,
    timer: null,
    settings: { name: '', focus: 25, short: 5, long: 15, longEvery: 4, sound: true, vibrate: true },
  };
}

const num = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Garante que qualquer dado (antigo, importado ou corrompido) tenha o formato esperado.
export function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;

  const rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = {
    name: String(rs.name || '').trim().slice(0, 20),
    focus: num(rs.focus, 1, 120, base.settings.focus),
    short: num(rs.short, 1, 60, base.settings.short),
    long: num(rs.long, 1, 90, base.settings.long),
    longEvery: num(rs.longEvery, 2, 8, base.settings.longEvery),
    sound: rs.sound !== false,
    vibrate: rs.vibrate !== false,
  };

  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter((t) => t && t.id && typeof t.title === 'string' && t.title.trim())
    .map((t) => ({
      id: String(t.id),
      title: t.title.trim().slice(0, 120),
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'media',
      project: String(t.project || '').trim().slice(0, 30),
      due: DATE_RE.test(t.due || '') ? t.due : '',
      done: !!t.done,
      doneAt: t.done && Number(t.doneAt) ? Number(t.doneAt) : null,
      createdAt: Number(t.createdAt) || Date.now(),
      pomodoros: Math.max(0, Math.round(Number(t.pomodoros)) || 0),
    }));

  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter((s) => s && Number(s.ts) > 0 && Number(s.minutes) > 0)
    .map((s) => ({
      id: String(s.id || s.ts),
      taskId: s.taskId ? String(s.taskId) : null,
      minutes: Math.round(Number(s.minutes)),
      ts: Number(s.ts),
    }));

  let timer = null;
  const rt = raw.timer;
  if (rt && MODES.includes(rt.mode) && Number(rt.total) > 0) {
    timer = {
      mode: rt.mode,
      running: !!rt.running && Number(rt.endAt) > 0,
      endAt: Number(rt.endAt) > 0 ? Number(rt.endAt) : null,
      remaining: Math.max(0, Math.round(Number(rt.remaining)) || 0),
      total: Math.round(Number(rt.total)),
    };
  }

  const activeTaskId = tasks.some((t) => t.id === raw.activeTaskId) ? raw.activeTaskId : null;

  return {
    v: 1,
    tasks,
    sessions,
    cycle: Math.max(0, Math.round(Number(raw.cycle)) || 0),
    activeTaskId,
    timer,
    settings,
  };
}

export const Storage = {
  load() {
    try {
      const txt = window.localStorage.getItem(KEY);
      return normalize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      return normalize(memoryFallback);
    }
  },

  save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      memoryFallback = JSON.parse(JSON.stringify(state));
      return false;
    }
  },

  reset() {
    memoryFallback = null;
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
    return defaults();
  },

  export(state) {
    return JSON.stringify({ app: 'foco', exportedAt: new Date().toISOString(), ...state }, null, 2);
  },

  // Lança erro se o texto não for um backup válido.
  parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Arquivo inválido'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
      throw new Error('Backup não reconhecido');
    }
    return normalize(data);
  },
};
