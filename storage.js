const KEY = 'psi.app.v1';
export const snake = (k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
export const SCHEMA = {
  patients: { table: 'patients', d: { status: 'ativo' }, f: { name: 's', birthDate: 'd', phone: 's', email: 's', isMinor: 'b', guardianName: 's', guardianRelation: 's', guardianPhone: 's', occupation: 's', status: 's', notes: 'x' } },
  appointments: { table: 'appointments', d: { kind: 'sessao', modality: 'presencial', status: 'agendada', durationMin: 50 }, f: { patientId: 'i', kind: 's', date: 'd', startTime: 't', durationMin: 'n', modality: 's', status: 's', notes: 'x' } },
  anamneses: { table: 'anamneses', f: { patientId: 'i', date: 'd', referral: 's', complaint: 'x', complaintHistory: 'x', development: 'x', healthHistory: 'x', familyHistory: 'x', schoolSocial: 'x', previousTreatments: 'x', medications: 'x', expectations: 'x' } },
  assessments: { table: 'assessments', f: { patientId: 'i', date: 'd', instruments: 'x', observation: 'x', emotionalState: 'x', cognitive: 'x', risk: 'x', impressions: 'x', hypotheses: 'x', conclusion: 'x' } },
  plans: { table: 'therapeutic_plans', f: { patientId: 'i', date: 'd', approach: 's', frequency: 's', objective: 'x', goals: 'j', strategies: 'x', notes: 'x' } },
  guardianMeetings: { table: 'guardian_meetings', f: { patientId: 'i', date: 'd', attendees: 's', topics: 'x', guidance: 'x', agreements: 'x', nextSteps: 'x' } },
  sessionNotes: { table: 'session_notes', f: { patientId: 'i', appointmentId: 'i', date: 'd', number: 'n', mood: 's', themes: 'x', interventions: 'x', response: 'x', evolution: 'x', nextSteps: 'x', attention: 'b' } },
  reevaluations: { table: 'reevaluations', f: { patientId: 'i', date: 'd', summary: 'x', goalsReview: 'j', progress: 'x', adjustments: 'x', decision: 's' } },
  discharges: { table: 'discharges', f: { patientId: 'i', date: 'd', reason: 's', summary: 'x', outcomes: 'x', recommendations: 'x', referral: 's', followUp: 'x' } },
  reminders: { table: 'reminders', d: { priority: 'media' }, f: { patientId: 'i', title: 's', notes: 'x', dueDate: 'd', dueTime: 't', priority: 's', done: 'b' } },
  notifications: { table: 'notifications', f: { kind: 's', title: 's', body: 's', refType: 's', refId: 's', read: 'b' } },
  reports: { table: 'reports', f: { patientId: 'i', kind: 's', title: 's', periodStart: 'd', periodEnd: 'd', content: 'x' } },
};
const C = {
  s: (v) => String(v == null ? '' : v).slice(0, 300),
  x: (v) => String(v == null ? '' : v).slice(0, 20000),
  n: (v) => Math.round(Number(v)) || 0,
  b: (v) => !!v,
  d: (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(0, 10) : ''),
  t: (v) => (/^\d{2}:\d{2}/.test(v || '') ? v.slice(0, 5) : ''),
  i: (v) => (v ? String(v) : ''),
  j: (v) => (Array.isArray(v) ? v : []),
};
export function rec(e, raw) {
  const { f, d = {} } = SCHEMA[e];
  const o = { id: String(raw.id), createdAt: Number(raw.createdAt) || Date.now() };
  for (const k in f) {
    const v = raw[k] === undefined || raw[k] === null || raw[k] === '' ? d[k] : raw[k];
    o[k] = C[f[k]](v);
  }
  return o;
}
const num = (v, a, b, f) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : f;
};
export function defaults() {
  const s = { v: 2, settings: { name: '', crp: '', clinic: '', sessionMin: 50, notifyMin: 30, sound: true, vibrate: true } };
  Object.keys(SCHEMA).forEach((e) => { s[e] = []; });
  return s;
}
export function normalize(raw) {
  const s = defaults();
  if (!raw || typeof raw !== 'object') return s;
  Object.keys(SCHEMA).forEach((e) => {
    s[e] = (Array.isArray(raw[e]) ? raw[e] : []).filter((r) => r && r.id).map((r) => rec(e, r));
  });
  const rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  s.settings = {
    name: String(rs.name || '').trim().replace(/^Doutora$/i, 'Princesa').slice(0, 60),
    crp: String(rs.crp || '').trim().slice(0, 30),
    clinic: String(rs.clinic || '').trim().slice(0, 60),
    sessionMin: num(rs.sessionMin, 10, 240, 50),
    notifyMin: num(rs.notifyMin, 0, 1440, 30),
    sound: rs.sound !== false,
    vibrate: rs.vibrate !== false,
  };
  return s;
}
let memoryFallback = null;
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
    try { window.localStorage.removeItem(KEY); } catch (e) { }
    return defaults();
  },
  export(state) {
    return JSON.stringify({ app: 'psi', exportedAt: new Date().toISOString(), ...state }, null, 2);
  },
  parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Arquivo inválido'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.patients)) throw new Error('Backup não reconhecido');
    return normalize(data);
  },
};
