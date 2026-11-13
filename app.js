import { Storage, SCHEMA } from './storage.js';
import { Cloud } from './cloud.js';
import { Push } from './push.js';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
const addMin = (t, m) => { const [h, i] = t.split(':').map(Number); const x = h * 60 + i + m; return pad(Math.floor(x / 60)) + ':' + pad(x % 60); };
const toMin = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);
const uid = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const svg = (id) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  s.setAttribute('class', 'ic');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '');
const age = (d) => {
  if (!d) return '';
  const b = new Date(d + 'T00:00');
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
};
const sh = (s, n = 70) => ((s || '').length > n ? s.slice(0, n) + '…' : s || '');
const lab = (o, v) => (o.find((x) => x[0] === v) || [0, v || ''])[1];
const STPAT = [['ativo', 'Em atendimento'], ['avaliacao', 'Em avaliação'], ['pausa', 'Em pausa'], ['alta', 'Alta'], ['encerrado', 'Encerrado']];
const KINDS = [['sessao', 'Sessão'], ['anamnese', 'Entrevista inicial'], ['avaliacao', 'Avaliação inicial'], ['responsaveis', 'Orientação a responsáveis'], ['reavaliacao', 'Reavaliação'], ['devolutiva', 'Devolutiva'], ['outro', 'Outro']];
const MODS = [['presencial', 'Presencial'], ['online', 'Online']];
const APST = [['agendada', 'Agendada'], ['confirmada', 'Confirmada'], ['realizada', 'Realizada'], ['faltou', 'Faltou'], ['cancelada', 'Cancelada'], ['remarcada', 'Remarcada']];
const PRIO = [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']];
const GST = [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['atingida', 'Atingida'], ['revista', 'Revista']];
const DECS = [['manter', 'Manter plano'], ['ajustar', 'Ajustar metas'], ['alta', 'Alta'], ['encaminhar', 'Encaminhar']];
const REAS = [['alta', 'Alta (objetivos atingidos)'], ['abandono', 'Abandono'], ['encaminhamento', 'Encaminhamento'], ['responsaveis', 'Decisão dos responsáveis'], ['outro', 'Outro']];
const RKIND = [['relatorio', 'Relatório clínico'], ['resumo', 'Resumo dos atendimentos'], ['declaracao', 'Declaração de comparecimento']];
const OFF = ['cancelada', 'remarcada'];
const WPS = [['prefeitura', 'Prefeitura'], ['clinica', 'Clínica']];
const WPKEY = 'psi.wp.v1';
const loadWp = () => { try { return localStorage.getItem(WPKEY) === 'prefeitura' ? 'prefeitura' : 'clinica'; } catch (e) { return 'clinica'; } };
const TITLES = { agenda: 'Agenda', patients: 'Pacientes', reminders: 'Lembretes', more: 'Ajustes', patient: 'Paciente', notifs: 'Notificações' };
const T = 'text', A = 'area', D = 'date', H = 'time', N = 'num', S = 'sel', P = 'pat', C = 'chk';
let state = Storage.load();
const ui = { screen: 'agenda', prev: 'agenda', day: dayKey(), pid: null, q: '', exp: new Set(), form: null, cal: '', calFor: '', wp: loadWp() };
// Layout horizontal: SHELL = barra lateral (PC / paisagem); WIDE = lista + detalhe lado a lado.
const MQ_SHELL = window.matchMedia('(min-width: 1000px), (orientation: landscape) and (min-width: 640px)');
const MQ_WIDE = window.matchMedia('(min-width: 1000px), (orientation: landscape) and (min-width: 840px)');
const master = () => MQ_WIDE.matches;
const initials = (n) => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
const avatar = (n, c = '') => el('span', 'av' + (c ? ' ' + c : ''), initials(n));
const FABL = { agenda: 'Nova consulta', patients: 'Novo paciente', patient: 'Nova consulta', reminders: 'Novo lembrete', notifs: 'Novo lembrete', more: 'Novo relatório' };
const sortedPatients = () => state.patients.filter((p) => p.workplace === ui.wp).sort((a, b) => (a.status === 'encerrado') - (b.status === 'encerrado') || a.name.localeCompare(b.name));
const byId = (e, id) => state[e].find((x) => x.id === id);
const pname = (id) => (byId('patients', id) || { name: '—' }).name;
const inWp = (x) => x.workplace === ui.wp;
const wpPatients = () => state.patients.filter(inWp);
const wpAppts = () => state.appointments.filter(inWp);
const wpRems = () => state.reminders.filter(inWp);
const wpOfRef = (n) => {
  const t = n.refType;
  const r = t === 'appointments' || t === 'reminders' || t === 'patients' ? byId(t, n.refId) : null;
  return r ? r.workplace : null;
};
const wpNotifs = () => state.notifications.filter((n) => { const w = wpOfRef(n); return !w || w === ui.wp; });
const wpReports = () => state.reports.filter((r) => { const p = byId('patients', r.patientId); return p && p.workplace === ui.wp; });
function setWp(w) {
  if ((w !== 'prefeitura' && w !== 'clinica') || w === ui.wp) return;
  ui.wp = w;
  try { localStorage.setItem(WPKEY, w); } catch (e) {}
  ui.pid = (sortedPatients()[0] || {}).id || null;
  ui.exp.clear();
  ui.q = '';
  const sr = $('#search');
  if (sr) sr.value = '';
  if (ui.screen === 'patient') go('patients'); else render();
}
const mine = (e, pid) => state[e].filter((x) => x.patientId === pid);
const latest = (e, pid) => mine(e, pid).sort((a, b) => b.date.localeCompare(a.date))[0];
const latestGoals = (pid) => { const p = latest('plans', pid); return p ? p.goals.map((g) => ({ ...g })) : []; };
function put(e, r) {
  const L = state[e];
  const i = L.findIndex((x) => x.id === r.id);
  if (i < 0) { r.createdAt = r.createdAt || Date.now(); L.push(r); } else L[i] = r;
  Storage.save(state);
  Cloud.mark(e, r.id);
  if (e === 'reminders' || e === 'appointments') Push.reconcile(state);
  return r;
}
function drop(e, id) {
  const i = state[e].findIndex((x) => x.id === id);
  if (i < 0) return;
  state[e].splice(i, 1);
  Storage.save(state);
  Cloud.del(e, id);
  if (e === 'reminders' || e === 'appointments') Push.reconcile(state);
}
function removePatient(id) {
  Object.keys(SCHEMA).forEach((e) => {
    if (e !== 'patients' && e !== 'notifications') state[e].filter((r) => r.patientId === id).forEach((r) => drop(e, r.id));
  });
  drop('patients', id);
}
const tap = (ms = 8) => { if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
function toast(msg, opts = {}) {
  const t = el('div', 'toast glass' + (opts.type ? ' ' + opts.type : ''));
  t.append(el('span', '', msg));
  let timer;
  const remove = () => { clearTimeout(timer); t.classList.remove('show'); setTimeout(() => t.remove(), 350); };
  if (opts.action) {
    const b = el('button', '', opts.action.label);
    b.type = 'button';
    b.onclick = () => { opts.action.fn(); remove(); };
    t.append(b);
  }
  const box = $('#toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  box.append(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  timer = setTimeout(remove, opts.duration || 3200);
}
let openSheetEl = null;
function openSheet(s) {
  if (openSheetEl) shut();
  openSheetEl = s;
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
  $('#backdrop').classList.add('open');
  document.body.classList.add('lock');
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: 1 }, '');
}
function shut() {
  if (!openSheetEl) return;
  openSheetEl.classList.remove('open');
  openSheetEl.setAttribute('aria-hidden', 'true');
  openSheetEl = null;
  $('#backdrop').classList.remove('open');
  document.body.classList.remove('lock');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function closeSheet() {
  if (!openSheetEl) return;
  shut();
  if (history.state && history.state.sheet) { ui.skip = (ui.skip || 0) + 1; history.back(); }
}
function confirmDialog(title, text, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    $('#dlg-title').textContent = title;
    $('#dlg-text').textContent = text;
    $('#dlg-ok').textContent = okLabel;
    const d = $('#dialog');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    const finish = (v) => {
      d.classList.remove('open');
      d.setAttribute('aria-hidden', 'true');
      $('#dlg-ok').onclick = null;
      $('#dlg-cancel').onclick = null;
      d.onclick = null;
      resolve(v);
    };
    $('#dlg-ok').onclick = () => finish(true);
    $('#dlg-cancel').onclick = () => finish(false);
    d.onclick = (e) => { if (e.target === d) finish(false); };
  });
}
function openPicker(title, items, onPick) {
  $('#picker-title').textContent = title;
  const ul = $('#picker-list');
  ul.innerHTML = '';
  items.forEach((it) => {
    const li = el('li');
    const b = el('button', 'pick' + (it.sel ? ' sel' : ''));
    b.type = 'button';
    b.append(el('span', '', it.l));
    if (it.s) b.append(el('small', '', it.s));
    b.onclick = () => { closeSheet(); onPick(it.v); };
    li.append(b);
    ul.append(li);
  });
  openSheet($('#sheet-picker'));
}
function item(t, s, fn, cls = '') {
  const b = el('button', 'item ' + cls);
  b.type = 'button';
  const bd = el('div', 'bd');
  bd.append(el('div', 't', t));
  if (s) bd.append(el('div', 's', s));
  b.append(bd);
  b.onclick = fn;
  return b;
}
function buildReport(r) {
  const p = byId('patients', r.patientId);
  if (!p) return '';
  const s = state.settings;
  const inR = (d) => (!r.periodStart || d >= r.periodStart) && (!r.periodEnd || d <= r.periodEnd);
  const ap = mine('appointments', p.id).filter((a) => inR(a.date));
  const real = ap.filter((a) => a.status === 'realizada').length;
  const falt = ap.filter((a) => a.status === 'faltou').length;
  const notes = mine('sessionNotes', p.id).filter((n) => inR(n.date)).sort((a, b) => a.date.localeCompare(b.date));
  const plan = latest('plans', p.id);
  const asm = latest('assessments', p.id);
  const ana = latest('anamneses', p.id);
  const per = r.periodStart || r.periodEnd ? `${fmtDate(r.periodStart) || 'início'} a ${fmtDate(r.periodEnd) || fmtDate(dayKey())}` : 'todo o acompanhamento';
  const sign = '\n' + [s.name, s.crp ? 'CRP ' + s.crp : '', p.workplace === 'prefeitura' ? 'Prefeitura' : s.clinic, fmtDate(dayKey())].filter(Boolean).join('\n');
  if (r.kind === 'declaracao') return `DECLARAÇÃO DE COMPARECIMENTO\n\nDeclaro que ${p.name} compareceu a ${real} atendimento(s) psicológico(s) no período: ${per}.\n${sign}`;
  const L = [r.kind === 'resumo' ? 'RESUMO DOS ATENDIMENTOS' : 'RELATÓRIO PSICOLÓGICO', '', `Paciente: ${p.name}${p.birthDate ? ' · ' + age(p.birthDate) + ' anos' : ''}`, `Período: ${per}`, `Atendimentos realizados: ${real} · Faltas: ${falt}`];
  if (r.kind === 'relatorio') {
    if (ana && ana.complaint) L.push('', 'Queixa principal:', ana.complaint);
    if (asm && asm.impressions) L.push('', 'Impressões clínicas:', asm.impressions);
    if (asm && asm.hypotheses) L.push('', 'Hipóteses diagnósticas:', asm.hypotheses);
    if (plan) L.push('', 'Plano terapêutico:', [plan.approach, plan.frequency].filter(Boolean).join(' · '), ...plan.goals.map((g) => `- ${g.text} (${lab(GST, g.status)})`));
  }
  if (notes.length) L.push('', 'Evolução:', ...notes.map((n) => `${fmtDate(n.date)}: ${n.evolution || n.themes}`));
  L.push(sign);
  return L.join('\n');
}
const FORMS = {
  patients: {
    title: 'Paciente', req: ['name'], init: () => ({ status: 'ativo', workplace: ui.wp }),
    fields: [['name', 'Nome completo', T], ['workplace', 'Local de atendimento', S, WPS], ['birthDate', 'Nascimento', D], ['phone', 'Telefone', T], ['email', 'E-mail', T], ['isMinor', 'Menor de idade (envolve responsáveis)', C], ['guardianName', 'Responsável', T], ['guardianRelation', 'Parentesco', T], ['guardianPhone', 'Telefone do responsável', T], ['occupation', 'Escola / ocupação', T], ['status', 'Situação', S, STPAT], ['notes', 'Observações', A]],
    after: (r) => { ['appointments', 'reminders'].forEach((e) => state[e].filter((x) => x.patientId === r.id && x.workplace !== r.workplace).forEach((x) => { x.workplace = r.workplace; put(e, x); })); },
    sum: (p) => [p.name, lab(STPAT, p.status)],
  },
  appointments: {
    title: 'Agendamento', needsPatient: 1, req: ['patientId', 'date', 'startTime'],
    init: () => ({ kind: 'sessao', startTime: '09:00', durationMin: state.settings.sessionMin, modality: 'presencial', status: 'agendada', date: ui.day, workplace: ui.wp }),
    before: (r) => { const p = byId('patients', r.patientId); if (p) r.workplace = p.workplace; },
    fields: [['patientId', 'Paciente', P], ['kind', 'Tipo', S, KINDS], ['date', 'Data', D], ['startTime', 'Horário', H], ['durationMin', 'Duração (min)', N], ['modality', 'Modalidade', S, MODS], ['status', 'Status', S, APST], ['notes', 'Observações', A]],
    check: (r) => {
      if (r.durationMin < 5) return 'Duração inválida';
      if (OFF.includes(r.status)) return '';
      const c = state.appointments.find((a) => a.id !== r.id && a.date === r.date && !OFF.includes(a.status) && a.startTime < addMin(r.startTime, r.durationMin) && r.startTime < addMin(a.startTime, a.durationMin));
      return c ? `Conflito com ${pname(c.patientId)} às ${c.startTime}` : '';
    },
    sum: (a) => [fmtDate(a.date) + ' ' + a.startTime, [lab(KINDS, a.kind), lab(APST, a.status)].join(' · ')],
  },
  anamneses: {
    title: 'Entrevista inicial (anamnese)', needsPatient: 1, req: ['patientId', 'date'], init: () => ({ date: dayKey() }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['referral', 'Encaminhamento / quem indicou', T], ['complaint', 'Queixa principal', A], ['complaintHistory', 'História da queixa', A], ['development', 'Desenvolvimento (gestação, marcos, escola)', A], ['healthHistory', 'Histórico de saúde', A], ['familyHistory', 'Histórico e dinâmica familiar', A], ['schoolSocial', 'Vida escolar/profissional e social', A], ['previousTreatments', 'Tratamentos anteriores', A], ['medications', 'Medicações em uso', A], ['expectations', 'Expectativas com o atendimento', A]],
    sum: (r) => [fmtDate(r.date), sh(r.complaint)],
  },
  assessments: {
    title: 'Avaliação psicológica inicial', needsPatient: 1, req: ['patientId', 'date'], init: () => ({ date: dayKey() }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['instruments', 'Instrumentos e técnicas', A], ['observation', 'Observação do comportamento', A], ['emotionalState', 'Aspectos emocionais', A], ['cognitive', 'Aspectos cognitivos', A], ['risk', 'Avaliação de risco', A], ['impressions', 'Impressões clínicas', A], ['hypotheses', 'Hipóteses diagnósticas', A], ['conclusion', 'Conclusão e encaminhamentos', A]],
    sum: (r) => [fmtDate(r.date), sh(r.impressions)],
  },
  plans: {
    title: 'Planejamento terapêutico', needsPatient: 1, req: ['patientId', 'date'], init: () => ({ date: dayKey(), goals: [] }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['approach', 'Abordagem', T], ['frequency', 'Frequência (ex.: semanal)', T], ['objective', 'Objetivo geral', A], ['goals', 'Metas (uma por linha)', 'goals'], ['strategies', 'Estratégias e intervenções', A], ['notes', 'Observações', A]],
    sum: (r) => [fmtDate(r.date) + (r.approach ? ' · ' + r.approach : ''), `${r.goals.length} meta(s)`],
  },
  guardianMeetings: {
    title: 'Orientação aos responsáveis', needsPatient: 1, req: ['patientId', 'date'], init: () => ({ date: dayKey() }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['attendees', 'Participantes', T], ['topics', 'Assuntos tratados', A], ['guidance', 'Orientações dadas', A], ['agreements', 'Combinados', A], ['nextSteps', 'Próximos passos', A]],
    sum: (r) => [fmtDate(r.date), sh(r.topics)],
  },
  sessionNotes: {
    title: 'Evolução da sessão', needsPatient: 1, req: ['patientId', 'date'],
    init: (pre) => ({ date: dayKey(), number: mine('sessionNotes', pre.patientId).length + 1 }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['number', 'Nº da sessão', N], ['mood', 'Estado emocional / humor', T], ['themes', 'Temas abordados', A], ['interventions', 'Intervenções realizadas', A], ['response', 'Resposta do paciente', A], ['evolution', 'Evolução', A], ['nextSteps', 'Plano para a próxima sessão', A], ['attention', 'Ponto de atenção', C]],
    after: (r) => { const a = byId('appointments', r.appointmentId); if (a && a.status !== 'realizada') { a.status = 'realizada'; put('appointments', a); } },
    sum: (r) => [(r.attention ? '⚑ ' : '') + `Sessão ${r.number} · ${fmtDate(r.date)}`, sh(r.evolution || r.themes)],
  },
  reevaluations: {
    title: 'Reavaliação', needsPatient: 1, req: ['patientId', 'date'],
    init: (pre) => ({ date: dayKey(), goalsReview: latestGoals(pre.patientId) }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['summary', 'Resumo do período', A], ['goalsReview', 'Metas', 'review'], ['progress', 'Progressos observados', A], ['adjustments', 'Ajustes no planejamento', A], ['decision', 'Decisão', S, DECS]],
    after: (r) => {
      const pl = latest('plans', r.patientId);
      if (!pl) return;
      pl.goals = pl.goals.map((g) => { const x = r.goalsReview.find((y) => y.id === g.id); return x ? { ...g, status: x.status } : g; });
      put('plans', pl);
    },
    sum: (r) => [fmtDate(r.date), lab(DECS, r.decision) + (r.progress ? ' · ' + sh(r.progress, 50) : '')],
  },
  discharges: {
    title: 'Encerramento / alta', needsPatient: 1, req: ['patientId', 'date'], init: () => ({ date: dayKey(), reason: 'alta' }),
    fields: [['patientId', 'Paciente', P], ['date', 'Data', D], ['reason', 'Motivo', S, REAS], ['summary', 'Síntese do processo terapêutico', A], ['outcomes', 'Resultados das metas', A], ['recommendations', 'Recomendações', A], ['referral', 'Encaminhado para', T], ['followUp', 'Acompanhamento posterior', A]],
    after: (r) => { const p = byId('patients', r.patientId); if (p) { p.status = r.reason === 'alta' ? 'alta' : 'encerrado'; put('patients', p); } },
    sum: (r) => [fmtDate(r.date), lab(REAS, r.reason)],
  },
  reminders: {
    title: 'Lembrete', req: ['title'], init: () => { const d = new Date(Date.now() + 36e5); return { priority: 'media', done: false, workplace: ui.wp, dueDate: dayKey(d.getTime()), dueTime: pad(d.getHours()) + ':00' }; },
    before: (r) => { const p = r.patientId && byId('patients', r.patientId); if (p) r.workplace = p.workplace; },
    fields: [['title', 'Lembrete', T], ['patientId', 'Paciente (opcional)', P, 'opt'], ['dueDate', 'Data', D], ['dueTime', 'Hora', H], ['priority', 'Prioridade', S, PRIO], ['notes', 'Observações', A]],
    sum: (r) => [r.title, fmtDate(r.dueDate)],
  },
  reports: {
    title: 'Relatório', needsPatient: 1, req: ['patientId'], init: () => ({ kind: 'relatorio', content: '' }),
    fields: [['patientId', 'Paciente', P], ['kind', 'Modelo', S, RKIND], ['title', 'Título (opcional)', T], ['periodStart', 'De', D], ['periodEnd', 'Até', D], ['content', 'Texto do documento', A]],
    before: (r) => { if (!r.content) r.content = buildReport(r); if (!r.title) r.title = lab(RKIND, r.kind) + ' — ' + pname(r.patientId); },
    extra: [
      ['Gerar texto', (r, set) => set(buildReport(r))],
      ['Copiar', (r) => navigator.clipboard.writeText(r.content).then(() => toast('Texto copiado', { type: 'ok' }), () => toast('Cópia bloqueada pelo sistema', { type: 'err' }))],
      ['Imprimir', (r) => { $('#print-area').textContent = r.content; window.print(); }],
    ],
    sum: (r) => [r.title, pname(r.patientId) + ' · ' + fmtDate(dayKey(r.createdAt))],
  },
};
const SECTIONS = ['appointments', 'anamneses', 'assessments', 'plans', 'guardianMeetings', 'sessionNotes', 'reevaluations', 'discharges', 'reports'];
const patientOpts = (opt) => [...(opt ? [['', '— Sem paciente —']] : []), ...wpPatients().sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, p.name])];
let inputs = {};
function openForm(e, rec, pre = {}) {
  const F = FORMS[e];
  if (F.needsPatient && !state.patients.length) { toast('Cadastre um paciente primeiro', { type: 'err' }); return; }
  const data = Object.assign({}, F.init ? F.init(pre) : {}, pre, rec || {});
  ui.form = { e, rec, F, data };
  inputs = {};
  $('#form-title').textContent = F.title;
  const body = $('#form-body');
  body.innerHTML = '';
  F.fields.forEach(([k, l, t, o]) => {
    const lb = el(t === 'review' ? 'div' : 'label', 'field' + (t === C ? ' chk' : ''));
    lb.append(el('span', '', l));
    if (t === 'review') {
      const rows = [];
      (data[k] || []).forEach((g) => {
        const r = el('div', 'rv');
        r.append(el('span', '', g.text));
        const s = el('select');
        GST.forEach(([v, x]) => { const op = el('option', '', x); op.value = v; s.append(op); });
        s.value = g.status;
        r.append(s);
        lb.append(r);
        rows.push([g, s]);
      });
      if (!rows.length) lb.append(el('div', 'row-s dk', 'Nenhuma meta no planejamento terapêutico.'));
      inputs[k] = rows;
      body.append(lb);
      return;
    }
    let i;
    if (t === A || t === 'goals') {
      i = el('textarea');
      i.rows = e === 'reports' && k === 'content' ? 12 : 3;
      i.value = t === 'goals' ? (data[k] || []).map((g) => g.text).join('\n') : data[k] || '';
    } else if (t === S || t === P) {
      i = el('select');
      (t === P ? patientOpts(o === 'opt') : o).forEach(([v, x]) => { const op = el('option', '', x); op.value = v; i.append(op); });
      i.value = data[k] || '';
      if (i.selectedIndex < 0) i.selectedIndex = 0;
    } else {
      i = el('input');
      i.type = { [T]: 'text', [D]: 'date', [H]: 'time', [N]: 'number', [C]: 'checkbox' }[t];
      if (t === N) i.inputMode = 'numeric';
      if (t === C) i.checked = !!data[k]; else i.value = data[k] == null ? '' : data[k];
    }
    inputs[k] = i;
    lb.append(i);
    body.append(lb);
  });
  const ex = $('#form-extra');
  ex.innerHTML = '';
  (F.extra || []).forEach(([l, fn]) => {
    const b = el('button', 'btn soft', l);
    b.type = 'button';
    b.onclick = () => fn(collect(), (v) => { inputs.content.value = v; });
    ex.append(b);
  });
  $('#form-del').hidden = !rec;
  $('#sheet-form').scrollTop = 0;
  openSheet($('#sheet-form'));
}
function collect() {
  const { F, data } = ui.form;
  const out = Object.assign({ id: uid() }, data);
  F.fields.forEach(([k, , t]) => {
    const i = inputs[k];
    if (t === C) out[k] = i.checked;
    else if (t === N) out[k] = Math.round(Number(i.value)) || 0;
    else if (t === 'goals') {
      const old = out[k] || [];
      out[k] = i.value.split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const o = old.find((g) => g.text === x); return { id: o ? o.id : uid(), text: x, status: o ? o.status : 'pendente' }; });
    } else if (t === 'review') out[k] = i.map(([g, s]) => ({ ...g, status: s.value }));
    else out[k] = i.value.trim();
  });
  return out;
}
function submitForm(ev) {
  ev.preventDefault();
  const { e, F } = ui.form;
  const r = collect();
  const bad = (F.req || []).filter((k) => !String(r[k] == null ? '' : r[k]).trim());
  if (bad.length) {
    bad.forEach((k) => { const i = inputs[k]; i.classList.remove('err'); void i.offsetWidth; i.classList.add('err'); });
    inputs[bad[0]].focus();
    tap(30);
    return;
  }
  const msg = F.check && F.check(r);
  if (msg) { toast(msg, { type: 'err' }); return; }
  if (F.before) F.before(r);
  put(e, r);
  if (F.after) F.after(r);
  tap(12);
  closeSheet();
  toast('Salvo', { type: 'ok' });
  if (e === 'patients' && r.workplace !== ui.wp) { setWp(r.workplace); toast('Paciente movido para ' + lab(WPS, r.workplace)); }
  if (e === 'patients' && master()) ui.pid = r.id;
  render();
  scan();
}
async function deleteForm() {
  const { e, rec } = ui.form;
  const msg = e === 'patients'
    ? 'Todo o prontuário deste paciente será removido. A guarda do prontuário é obrigatória por 5 anos; prefira marcar a situação como Encerrado.'
    : 'Este registro será removido.';
  if (!(await confirmDialog('Excluir?', msg, 'Excluir'))) return;
  closeSheet();
  if (e === 'patients') { removePatient(rec.id); go('patients'); } else drop(e, rec.id);
  toast('Excluído');
  render();
}
const ORDER = ['agenda', 'patients', 'reminders', 'more'];
const isSub = (n) => n === 'patient' || n === 'notifs';
function go(name, pop) {
  if (name === 'patient' && master()) name = 'patients';
  if (name === 'patients' && master() && (byId('patients', ui.pid) || {}).workplace !== ui.wp) ui.pid = (sortedPatients()[0] || {}).id || null;
  if (isSub(name) && !isSub(ui.screen)) ui.prev = ui.screen;
  if (isSub(name) && !pop && ui.screen !== name) history.pushState({ s: name }, '');
  $('#app').style.setProperty('--dir', (isSub(ui.screen) && !isSub(name) ? -18 : isSub(name) ? 18 : ORDER.indexOf(name) < ORDER.indexOf(ui.screen) ? -18 : 18) + 'px');
  ui.screen = name;
  $('#app').dataset.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name || (name === 'patients' && master() && s.id === 'screen-patient')));
  const nav = name === 'patient' ? 'patients' : name;
  $$('.nav button[data-go]').forEach((b) => {
    const on = b.dataset.go === nav;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $('#btn-back').hidden = !(name === 'patient' || name === 'notifs');
  $('#screen-title').textContent = TITLES[name];
  const fl = $('#fab .lbl');
  if (fl) fl.textContent = FABL[name] || 'Novo';
  $('#main').scrollTo({ top: 0 });
  render();
}
function openPatient(id) {
  ui.pid = id;
  go(master() ? 'patients' : 'patient');
  if (master()) $('#screen-patient').scrollTop = 0;
}
function render() {
  ({ agenda: rAgenda, patients: rPatients, reminders: rReminders, more: rMore, patient: rPatient, notifs: rNotifs })[ui.screen]();
  if (ui.screen === 'patients' && master()) rPatient();
  const who = state.settings.name || 'Princesa';
  $('#side-name').textContent = who;
  $('#side-av').textContent = initials(who);
  $('#side-sub').textContent = state.settings.crp ? 'CRP ' + state.settings.crp : state.settings.clinic || 'Consultório';
  $('#top-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const n = wpNotifs().filter((x) => !x.read).length;
  $$('#wp-bar button').forEach((b) => { const on = b.dataset.wp === ui.wp; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  $$('.js-bell-n').forEach((b) => { b.textContent = n > 9 ? '9+' : n; b.hidden = !n; });
}
function apptEl(a) {
  const li = el('li', 'appt');
  li.dataset.id = a.id;
  li.dataset.s = a.status;
  const tm = el('div', 'tm', a.startTime || '--:--');
  tm.append(el('small', '', a.durationMin + ' min'));
  const bd = el('div', 'bd');
  bd.append(el('div', 'nm', pname(a.patientId)), el('div', 'sb', [lab(KINDS, a.kind), lab(MODS, a.modality)].join(' · ')));
  const st = el('button', 'st', lab(APST, a.status));
  st.type = 'button';
  st.dataset.s = a.status;
  st.dataset.act = 'status';
  li.append(tm, bd, st);
  return li;
}
function rAgenda() {
  $('#hello-name').textContent = state.settings.name || 'Princesa';
  const day = ui.day;
  $('#day-label').textContent = (day === dayKey() ? 'Hoje · ' : '') + new Date(day + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const L = wpAppts().filter((a) => a.date === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const act = L.filter((a) => !OFF.includes(a.status));
  const done = L.filter((a) => a.status === 'realizada').length;
  $('#sum-text').textContent = `${act.length} consulta${act.length === 1 ? '' : 's'} no dia`;
  $('#sum-pct').textContent = `${done}/${act.length}`;
  $('#sum-bar').style.width = (act.length ? (done / act.length) * 100 : 0) + '%';
  const ul = $('#appt-list');
  ul.innerHTML = '';
  L.forEach((a) => ul.append(apptEl(a)));
  const nx = nextAppt(L);
  const nli = nx && ul.querySelector(`[data-id="${nx.id}"]`);
  if (nli) nli.classList.add('next');
  $('#appt-empty').hidden = L.length > 0;
  rSide(L, nx);
}
function nextAppt(L) {
  if (ui.day !== dayKey()) return null;
  const d = new Date();
  const nm = d.getHours() * 60 + d.getMinutes();
  return L.find((a) => (a.status === 'agendada' || a.status === 'confirmada') && toMin(a.startTime) + a.durationMin > nm) || null;
}
function shiftMonth(n) {
  const [y, m] = ui.cal.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  ui.cal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  rSide();
}
function rSide(L, nx) {
  if (!L) { L = wpAppts().filter((a) => a.date === ui.day).sort((a, b) => a.startTime.localeCompare(b.startTime)); nx = nextAppt(L); }
  if (ui.calFor !== ui.day) { ui.cal = ui.day.slice(0, 7); ui.calFor = ui.day; }
  const [y, m] = ui.cal.split('-').map(Number);
  $('#cal-title').textContent = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const has = new Set(wpAppts().filter((a) => a.date.startsWith(ui.cal) && !OFF.includes(a.status)).map((a) => a.date));
  const g = $('#cal-grid');
  g.innerHTML = '';
  for (let i = new Date(y, m - 1, 1).getDay(); i > 0; i--) g.append(el('i'));
  const today = dayKey();
  for (let d = 1, n = new Date(y, m, 0).getDate(); d <= n; d++) {
    const k = `${y}-${pad(m)}-${pad(d)}`;
    const b = el('button', 'cd' + (k === ui.day ? ' sel' : '') + (k === today ? ' today' : '') + (has.has(k) ? ' has' : ''), d);
    b.type = 'button';
    b.dataset.d = k;
    g.append(b);
  }
  const act = L.filter((a) => !OFF.includes(a.status));
  $('#sx-total').textContent = act.length;
  $('#sx-pend').textContent = act.filter((a) => a.status === 'agendada' || a.status === 'confirmada').length;
  $('#sx-done').textContent = L.filter((a) => a.status === 'realizada').length;
  $('#sx-miss').textContent = L.filter((a) => a.status === 'faltou').length;
  const nu = $('#next-up');
  nu.hidden = !nx;
  if (nx) nu.textContent = `Próxima: ${nx.startTime} · ${pname(nx.patientId)}`;
  const R = wpRems().filter((r) => !r.done).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.dueTime.localeCompare(b.dueTime)).slice(0, 5);
  const box = $('#side-rem');
  box.innerHTML = '';
  R.forEach((r) => {
    const over = r.dueDate && r.dueDate < today;
    box.append(item(r.title, [r.dueDate ? (over ? 'Atrasado · ' : '') + (r.dueDate === today ? 'Hoje' : fmtDate(r.dueDate)) + (r.dueTime ? ' ' + r.dueTime : '') : 'Sem data', r.patientId ? pname(r.patientId) : ''].filter(Boolean).join(' · '), () => openForm('reminders', r), over ? 'late' : ''));
  });
  $('#side-rem-empty').hidden = R.length > 0;
}
function pickStatus(a) {
  openPicker('Status da consulta', APST.map(([v, l]) => ({ v, l, sel: a.status === v })), (v) => {
    a.status = v;
    put('appointments', a);
    if (v === 'realizada' && !state.sessionNotes.some((n) => n.appointmentId === a.id)) {
      toast('Consulta realizada', { type: 'ok', duration: 6000, action: { label: 'Registrar evolução', fn: () => openForm('sessionNotes', null, { patientId: a.patientId, appointmentId: a.id, date: a.date }) } });
    }
    render();
    scan();
  });
}
function rPatients() {
  const q = ui.q.trim().toLowerCase();
  const L = wpPatients().filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => (a.status === 'encerrado') - (b.status === 'encerrado') || a.name.localeCompare(b.name));
  const box = $('#patient-list');
  box.innerHTML = '';
  const t = dayKey();
  L.forEach((p) => {
    const nx = state.appointments.filter((a) => a.patientId === p.id && a.date >= t && !OFF.includes(a.status)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
    const sub = [lab(STPAT, p.status), p.birthDate ? age(p.birthDate) + ' anos' : '', nx ? 'Próx.: ' + fmtDate(nx.date) + ' ' + nx.startTime : ''].filter(Boolean).join(' · ');
    const b = item(p.name, sub, () => openPatient(p.id), master() && p.id === ui.pid ? 'sel' : '');
    b.prepend(avatar(p.name));
    box.append(b);
  });
  $('#patient-card').hidden = !L.length;
  $('#patients-empty').hidden = L.length > 0;
}
function rPatient() {
  const p = byId('patients', ui.pid);
  const box = $('#patient-body');
  if (!p) {
    if (!master()) { go('patients'); return; }
    box.innerHTML = '';
    const ph = el('div', 'empty detail-empty');
    const ic = svg('i-user');
    ic.classList.add('big-ic');
    ph.append(ic, el('p', 'empty-t', state.patients.length ? 'Selecione um paciente' : 'Nenhum paciente cadastrado'), el('p', 'empty-s', state.patients.length ? 'Escolha um nome na lista para ver o prontuário.' : 'Use o botão “Novo paciente” para começar.'));
    box.append(ph);
    return;
  }
  if (!master()) $('#screen-title').textContent = p.name;
  box.innerHTML = '';
  const head = el('div', 'card glass pat-head');
  const pi = el('div', 'pi');
  pi.append(el('div', 'card-h', p.name), el('div', 'row-s', [lab(STPAT, p.status), p.birthDate ? `${age(p.birthDate)} anos (${fmtDate(p.birthDate)})` : '', p.phone, p.email].filter(Boolean).join(' · ')));
  if (p.guardianName) pi.append(el('div', 'row-s', 'Responsável: ' + p.guardianName + (p.guardianRelation ? ` (${p.guardianRelation})` : '') + (p.guardianPhone ? ' · ' + p.guardianPhone : '')));
  head.append(avatar(p.name, 'lg'), pi);
  const acts = el('div', 'btn-grid');
  [['Agendar', () => openForm('appointments', null, { patientId: p.id })], ['Editar', () => openForm('patients', p)], ['Relatório', () => openForm('reports', null, { patientId: p.id })]].forEach(([l, f]) => {
    const b = el('button', 'btn light', l);
    b.type = 'button';
    b.onclick = f;
    acts.append(b);
  });
  head.append(acts);
  box.append(head);
  SECTIONS.forEach((e) => {
    const F = FORMS[e];
    const L = mine(e, p.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
    const c = el('div', 'card glass');
    const h = el('div', 'card-h');
    h.append(el('span', '', F.title + (L.length ? ` (${L.length})` : '')));
    const add = el('button', 'mini', '+ Novo');
    add.type = 'button';
    add.onclick = () => openForm(e, null, { patientId: p.id });
    h.append(add);
    c.append(h);
    const open = ui.exp.has(e);
    (open ? L : L.slice(0, 3)).forEach((r) => { const [t, s] = F.sum(r); c.append(item(t, s, () => openForm(e, r))); });
    if (L.length > 3) {
      const m = el('button', 'mini mt', open ? 'Ver menos' : `Ver todos (${L.length})`);
      m.type = 'button';
      m.onclick = () => { if (open) ui.exp.delete(e); else ui.exp.add(e); rPatient(); };
      c.append(m);
    }
    box.append(c);
  });
}
function rReminders() {
  const t = dayKey();
  const L = [...wpRems()].sort((a, b) => a.done - b.done || (a.dueDate || '9').localeCompare(b.dueDate || '9') || a.dueTime.localeCompare(b.dueTime));
  const box = $('#reminder-list');
  box.innerHTML = '';
  L.forEach((r) => {
    const over = !r.done && r.dueDate && r.dueDate < t;
    const s = [r.dueDate ? (over ? 'Atrasado · ' : '') + (r.dueDate === t ? 'Hoje' : fmtDate(r.dueDate)) + (r.dueTime ? ' ' + r.dueTime : '') : 'Sem data', r.patientId ? pname(r.patientId) : '', lab(PRIO, r.priority)].filter(Boolean).join(' · ');
    const b = item(r.title, s, () => openForm('reminders', r), r.done ? 'done' : '');
    const ck = el('span', 'tick' + (r.done ? ' on' : ''));
    ck.append(svg('i-check'));
    ck.onclick = (ev) => { ev.stopPropagation(); r.done = !r.done; put('reminders', r); tap(14); render(); };
    b.prepend(ck);
    box.append(b);
  });
  $('#reminders-card').hidden = !L.length;
  $('#reminders-empty').hidden = L.length > 0;
}
function openNotif(n) {
  const w = wpOfRef(n);
  if (w && w !== ui.wp) setWp(w);
  n.read = true;
  put('notifications', n);
  const a = n.refType === 'appointments' ? byId('appointments', n.refId) : null;
  if (a && n.kind === 'evolucao') { openForm('sessionNotes', null, { patientId: a.patientId, appointmentId: a.id, date: a.date }); render(); return; }
  if (a) { ui.day = a.date; go('agenda'); return; }
  if (n.refType === 'reminders') { go('reminders'); return; }
  if (n.refType === 'patients' && byId('patients', n.refId)) { openPatient(n.refId); return; }
  render();
}
function rNotifs() {
  const box = $('#notif-list');
  box.innerHTML = '';
  const L = [...wpNotifs()].sort((a, b) => b.createdAt - a.createdAt);
  L.forEach((n) => box.append(item(n.title, n.body, () => openNotif(n), n.read ? '' : 'unread')));
  $('#notif-card').hidden = !L.length;
  $('#notif-empty').hidden = L.length > 0;
}
function rMore() {
  const box = $('#report-list');
  box.innerHTML = '';
  [...wpReports()].sort((a, b) => b.createdAt - a.createdAt).forEach((r) => box.append(item(r.title, pname(r.patientId) + ' · ' + fmtDate(dayKey(r.createdAt)), () => openForm('reports', r))));
  $('#reports-empty').hidden = wpReports().length > 0;
  $$('[data-setting]').forEach((i) => {
    const v = state.settings[i.dataset.setting];
    if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
  });
  renderCloud();
}
function scan() {
  const now = new Date();
  const t = dayKey();
  const nm = now.getHours() * 60 + now.getMinutes();
  const nw = state.settings.notifyMin;
  const fresh = [];
  const n = (id, kind, title, body, refType, refId) => {
    if (state.notifications.some((x) => x.id === id)) return;
    put('notifications', { id, kind, title, body, refType, refId, read: false });
    fresh.push([title, body]);
  };
  state.appointments.forEach((a) => {
    const live = a.status === 'agendada' || a.status === 'confirmada';
    const st = toMin(a.startTime);
    if (live && a.date === t && nm >= st - nw && nm <= st + a.durationMin) n(`ap-${a.id}-${a.date}`, 'consulta', 'Consulta em breve', `${a.startTime} · ${pname(a.patientId)}`, 'appointments', a.id);
    if (live && a.date < t) n(`st-${a.id}`, 'status', 'Atualize o status da consulta', `${fmtDate(a.date)} ${a.startTime} · ${pname(a.patientId)}`, 'appointments', a.id);
    if (a.status === 'realizada' && !state.sessionNotes.some((x) => x.appointmentId === a.id)) n(`ev-${a.id}`, 'evolucao', 'Evolução pendente', `${fmtDate(a.date)} · ${pname(a.patientId)}`, 'appointments', a.id);
  });
  state.reminders.forEach((r) => {
    if (!r.done && r.dueDate && (r.dueDate < t || (r.dueDate === t && (!r.dueTime || nm >= toMin(r.dueTime))))) n(`rm-${r.id}-${r.dueDate}`, 'lembrete', r.dueDate < t ? 'Lembrete atrasado' : 'Lembrete de hoje', r.title, 'reminders', r.id);
  });
  state.plans.forEach((p) => {
    const pt = byId('patients', p.patientId);
    if (!pt || ['alta', 'encerrado'].includes(pt.status) || !p.date) return;
    if (addDays(p.date, 90) <= t && !state.reevaluations.some((r) => r.patientId === p.patientId && r.date >= p.date)) n(`rv-${p.id}`, 'reavaliacao', 'Reavaliação sugerida', `${pt.name}: plano de ${fmtDate(p.date)}`, 'patients', p.patientId);
  });
  if (!fresh.length) return;
  toast(fresh.length === 1 ? fresh[0][0] + ' · ' + fresh[0][1] : `${fresh.length} novas notificações`, { duration: 4500 });
  if (state.settings.vibrate && navigator.vibrate) { try { navigator.vibrate([120, 80, 120]); } catch (e) {} }
  chime();
  render();
}
let ac = null;
function chime() {
  if (!state.settings.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.18;
      o.frequency.value = f; g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.4);
    });
  } catch (e) {}
}
function renderPush() {
  try { renderPush0(); } catch (e) { $('#push-status').textContent = 'Erro'; $('#push-help').textContent = String(e.message || e); }
}
function renderPush0() {
  const ios = /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone;
  const b = $('#push-btn');
  let st = 'Desativadas', help = 'Receba lembretes e consultas com som e vibração, mesmo com o app fechado.';
  b.disabled = false;
  $('#push-test').hidden = true;
  $('#push-hide').checked = Push.hide();
  if (!Push.supported()) { st = 'Indisponível'; help = ios ? 'No iPhone: toque em Compartilhar › Adicionar à Tela de Início e abra o app por lá.' : 'Este navegador não suporta notificações push.'; b.hidden = true; }
  else if (!Push.configured()) { st = 'Não configurado'; help = 'Falta colar a chave VAPID no push.js.'; b.disabled = true; }
  else if (!Cloud.isLoggedIn()) { help = 'Entre na conta (abaixo) para ativar: os avisos são enviados pela nuvem.'; b.disabled = true; }
  else if (Notification.permission === 'denied') { st = 'Bloqueadas'; help = 'Libere as notificações nas configurações do navegador ou do sistema.'; b.disabled = true; }
  else if (Push.enabled()) { st = 'Ativas'; help = 'Você será avisado no horário de cada lembrete e antes das consultas.'; $('#push-test').hidden = false; }
  b.textContent = Push.enabled() ? 'Desativar notificações' : 'Ativar notificações';
  $('#push-status').textContent = st;
  $('#push-help').textContent = help;
}
function nav(url) {
  const u = new URL(url, location.href), g = u.searchParams.get('go');
  if (u.searchParams.get('day')) ui.day = u.searchParams.get('day');
  if (g && ORDER.includes(g)) go(g);
  if (u.searchParams.get('new') === '1') openForm('reminders');
}
function bindNative() {
  Push.init();
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (ev) => { if (ev.data && ev.data.type === 'nav') nav(ev.data.url); });
  if (location.search.includes('go=')) nav(location.href);
  history.replaceState({ s: 'root' }, '');
  window.addEventListener('popstate', () => {
    if (ui.skip) { ui.skip--; return; }
    if (openSheetEl) { shut(); return; }
    if (isSub(ui.screen)) go(ui.prev, true);
  });
  $('#push-btn').onclick = async () => {
    try {
      if (Push.enabled()) await Push.disable(true); else { await Push.enable(state); chime(); toast('Notificações ativadas', { type: 'ok' }); }
    } catch (e) { toast(e.message || 'Não foi possível ativar', { type: 'err' }); }
    renderPush();
  };
  const seen = () => { try { localStorage.setItem('psi.onboard.v1', '1'); } catch (e) {} };
  let first = false;
  try { first = !localStorage.getItem('psi.onboard.v1'); } catch (e) {}
  if (first) setTimeout(() => {
    seen();
    $('#ob-ios').hidden = !(/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone);
    $('#ob-allow').hidden = !Push.supported();
    openSheet($('#sheet-onboard'));
  }, 800);
  $('#ob-later').onclick = () => closeSheet();
  $('#ob-allow').onclick = async () => {
    closeSheet();
    try {
      if ((await Push.ask()) !== 'granted') { toast('Sem permissão, os avisos não chegam com o app fechado', { type: 'err', duration: 5000 }); return renderPush(); }
      if (Cloud.isLoggedIn()) { await Push.enable(state); chime(); toast('Notificações ativadas', { type: 'ok' }); }
      else { toast('Permitido! Entre na conta para concluir', { type: 'ok', duration: 5000 }); go('more'); }
    } catch (e) { toast(e.message || 'Falha ao ativar', { type: 'err' }); }
    renderPush();
  };
  $('#push-hide').onchange = (ev) => Push.setHide(ev.target.checked, state);
  $('#push-test').onclick = () => Push.test().then(() => toast('Teste chegando em ~1 minuto', { type: 'ok' }), () => toast('Falha ao agendar teste', { type: 'err' }));
  $$('.sheet').forEach((s) => {
    let y0 = null, dy = 0;
    s.addEventListener('touchstart', (e) => { y0 = s.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    s.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; s.style.transition = 'none'; s.style.transform = dy > 0 ? `translateY(${dy}px)` : ''; }, { passive: true });
    s.addEventListener('touchend', () => { s.style.transition = ''; s.style.transform = ''; if (y0 != null && dy > 110) closeSheet(); y0 = null; });
  });
  let x0, y0, t0, ok = false;
  const m = $('#main');
  m.addEventListener('touchstart', (e) => { ok = !openSheetEl && !e.target.closest('input,textarea,select,.dialog'); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
  m.addEventListener('touchend', (e) => {
    if (!ok) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - t0 > 700) return;
    tap(8);
    if (isSub(ui.screen)) { if (dx > 0) (history.state && history.state.s ? history.back() : go(ui.prev)); return; }
    if (ui.screen === 'agenda') { ui.day = addDays(ui.day, dx < 0 ? 1 : -1); rAgenda(); return; }
    const i = ORDER.indexOf(ui.screen) + (dx < 0 ? 1 : -1);
    if (ORDER[i]) go(ORDER[i]);
  }, { passive: true });
}
function renderCloud() {
  const st = Cloud.status();
  const on = Cloud.isLoggedIn();
  $('#cloud-out').hidden = on;
  $('#cloud-in').hidden = !on;
  const labels = { unconfigured: 'Não configurado', out: 'Desconectado', idle: 'Conectado', syncing: 'Sincronizando…', ok: 'Sincronizado', offline: 'Sem conexão', error: 'Erro ao sincronizar' };
  $('#cloud-status').textContent = labels[st.state] || '';
  const dot = $('#side-dot');
  if (dot) { dot.dataset.s = st.state; dot.title = labels[st.state] || ''; }
  $('#cl-who').textContent = Cloud.email();
  if ($('#push-btn')) renderPush();
  const last = Cloud.lastSync();
  $('#cl-last').textContent = st.state === 'error' && st.msg ? st.msg : last ? 'Última sincronização: ' + new Date(last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Ainda não sincronizado';
  if (!Cloud.isConfigured()) $('#cl-login').disabled = true;
}
function startCloud() {
  Cloud.init({
    getState: () => state,
    merge: (e, up, del) => {
      const L = state[e];
      up.forEach((r) => { const i = L.findIndex((x) => x.id === r.id); if (i < 0) L.push(r); else L[i] = r; });
      state[e] = L.filter((x) => !del.includes(x.id));
    },
    setSettings: (s) => { state.settings = Object.assign({}, state.settings, s); },
    done: () => { Storage.save(state); render(); scan(); Push.reconcile(state); },
    onStatus: renderCloud,
  });
  renderCloud();
  Cloud.start();
  Push.auto(state).then(renderPush);
}
function bindSettings() {
  $$('[data-setting]').forEach((i) => i.addEventListener('change', () => {
    const k = i.dataset.setting;
    if (i.type === 'checkbox') state.settings[k] = i.checked;
    else if (i.type === 'number') {
      const a = Number(i.min);
      const b = Number(i.max);
      let v = Math.round(Number(i.value));
      if (!Number.isFinite(v)) v = a;
      v = Math.min(b, Math.max(a, v));
      i.value = v;
      state.settings[k] = v;
    } else { state.settings[k] = i.value.trim().slice(0, 60); i.value = state.settings[k]; }
    Storage.save(state);
    Cloud.markSettings();
    Push.reconcile(state);
    toast('Ajustes salvos', { type: 'ok', duration: 1800 });
  }));
  $('#btn-export').onclick = () => {
    try {
      const url = URL.createObjectURL(new Blob([Storage.export(state)], { type: 'application/json' }));
      const a = el('a');
      a.href = url;
      a.download = `consultorio-backup-${dayKey()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('Backup exportado (contém dados sigilosos, guarde com segurança)', { type: 'ok', duration: 5000 });
    } catch (e) { toast('Não foi possível exportar. Use "Copiar".', { type: 'err' }); }
  };
  $('#btn-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(Storage.export(state)); toast('Backup copiado', { type: 'ok' }); }
    catch (e) { toast('Cópia bloqueada pelo sistema', { type: 'err' }); }
  };
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const inc = Storage.parse(await file.text());
      if (!(await confirmDialog('Importar backup?', `Isto substituirá os dados atuais por ${inc.patients.length} paciente(s) e ${inc.appointments.length} agendamento(s).`, 'Importar'))) return;
      state = inc;
      Storage.save(state);
      Cloud.markAll(state);
      go('agenda');
      toast('Backup importado', { type: 'ok' });
    } catch (err) { toast(err.message || 'Falha ao importar', { type: 'err' }); }
  };
  $('#btn-reset-all').onclick = async () => {
    if (!(await confirmDialog('Apagar tudo?', `Todos os dados serão removidos ${Cloud.isLoggedIn() ? 'deste aparelho e marcados como excluídos na nuvem' : 'deste aparelho'}. Esta ação não pode ser desfeita.`, 'Apagar'))) return;
    Cloud.delAll(state);
    state = Storage.reset();
    go('agenda');
    toast('Dados apagados');
  };
}
function bindCloud() {
  $('#cl-login').onclick = async () => {
    const email = $('#cl-email').value.trim();
    const pass = $('#cl-pass').value;
    if (!email || !pass) { toast('Informe e-mail e senha', { type: 'err' }); return; }
    const btn = $('#cl-login');
    btn.disabled = true;
    try {
      await Cloud.login(email, pass);
      $('#cl-pass').value = '';
      Cloud.markAll(state);
      renderCloud();
      toast('Conectado', { type: 'ok' });
      Cloud.start();
      Push.auto(state).then(renderPush);
    } catch (e) { toast(e.message || 'Falha no login', { type: 'err' }); }
    finally { btn.disabled = !Cloud.isConfigured(); }
  };
  $('#cl-sync').onclick = () => Cloud.sync();
  $('#cl-logout').onclick = async () => {
    const p = Cloud.pending();
    const ok = await confirmDialog('Sair da conta?', 'Por segurança, os dados clínicos serão apagados deste aparelho (continuam na nuvem).' + (p ? ` Atenção: ${p} alteração(ões) ainda não sincronizada(s) serão perdidas.` : ''), 'Sair');
    if (!ok) return;
    await Push.disable();
    Cloud.logout();
    state = Storage.reset();
    go('agenda');
  };
}
const fab = () => ({
  agenda: () => openForm('appointments', null, { date: ui.day }),
  patients: () => openForm('patients'),
  reminders: () => openForm('reminders'),
  more: () => openForm('reports'),
  patient: () => openForm('appointments', null, { patientId: ui.pid }),
  notifs: () => openForm('reminders'),
})[ui.screen]();
function bindEvents() {
  $$('.nav button[data-go]').forEach((b) => b.addEventListener('click', () => { tap(8); go(b.dataset.go); }));
  $('#fab').addEventListener('click', () => { tap(10); fab(); });
  $('#btn-back').addEventListener('click', () => (history.state && history.state.s ? history.back() : go(ui.prev)));
  $$('.js-bell').forEach((b) => b.addEventListener('click', () => go('notifs')));
  $$('#wp-bar button').forEach((b) => b.addEventListener('click', () => { tap(8); setWp(b.dataset.wp); }));
  $('#day-prev').addEventListener('click', () => { ui.day = addDays(ui.day, -1); rAgenda(); });
  $('#day-next').addEventListener('click', () => { ui.day = addDays(ui.day, 1); rAgenda(); });
  $('#day-label').addEventListener('click', () => { ui.day = dayKey(); rAgenda(); });
  $('#appt-list').addEventListener('click', (ev) => {
    const li = ev.target.closest('.appt');
    const a = li && byId('appointments', li.dataset.id);
    if (!a) return;
    if (ev.target.closest('[data-act="status"]')) pickStatus(a); else openForm('appointments', a);
  });
  $('#search').addEventListener('input', (ev) => { ui.q = ev.target.value; rPatients(); });
  $('#notif-readall').addEventListener('click', () => { wpNotifs().filter((n) => !n.read).forEach((n) => { n.read = true; put('notifications', n); }); render(); });
  $('#btn-new-report').addEventListener('click', () => openForm('reports'));
  $('#sheet-form').addEventListener('submit', submitForm);
  $('#form-cancel').addEventListener('click', closeSheet);
  $('#form-del').addEventListener('click', deleteForm);
  $('#backdrop').addEventListener('click', closeSheet);
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#cal-grid').addEventListener('click', (ev) => { const b = ev.target.closest('[data-d]'); if (b) { ui.day = b.dataset.d; rAgenda(); } });
  $('#side-rem-all').addEventListener('click', () => go('reminders'));
  $('#side-me').addEventListener('click', () => go('more'));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { closeSheet(); return; }
    if (!MQ_SHELL.matches || ev.metaKey || ev.ctrlKey || ev.altKey || openSheetEl || $('#dialog').classList.contains('open')) return;
    if (ev.target.closest && ev.target.closest('input,textarea,select')) return;
    const k = ev.key;
    const dest = { 1: 'agenda', 2: 'patients', 3: 'reminders', 4: 'more' }[k];
    if (dest) go(dest);
    else if (k === 'n' || k === 'N') { ev.preventDefault(); fab(); }
    else if (k === '/') { ev.preventDefault(); go('patients'); setTimeout(() => $('#search').focus(), 0); }
    else if (ui.screen === 'agenda' && (k === 'ArrowLeft' || k === 'ArrowRight')) { ui.day = addDays(ui.day, k === 'ArrowRight' ? 1 : -1); rAgenda(); }
    else if (ui.screen === 'agenda' && (k === 't' || k === 'T')) { ui.day = dayKey(); rAgenda(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  window.addEventListener('pagehide', () => Storage.save(state));
  bindSettings();
  bindCloud();
}
// Puxar para atualizar (só na versão vertical): arrasta para baixo no topo da tela, como no Instagram.
function bindPull() {
  const m = $('#main');
  const ind = el('div', 'ptr');
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<svg class="ic"><use href="#i-reset"/></svg>';
  document.body.appendChild(ind);
  const MAX = 84, TRIG = 62;
  let y0 = null, x0 = 0, d = 0, working = false;
  const place = (v, rot) => { ind.style.transform = `translate(-50%, ${v - 52}px) rotate(${rot}deg)`; ind.style.opacity = String(Math.min(1, v / 36)); };
  const hide = () => { ind.style.transition = ''; ind.classList.remove('spin'); ind.style.transform = ''; ind.style.opacity = ''; };
  async function refresh() {
    working = true;
    ind.style.transition = '';
    ind.classList.add('spin');
    ind.style.transform = 'translate(-50%, 18px)';
    ind.style.opacity = '1';
    tap(12);
    const t0 = Date.now();
    let msg = 'Atualizado', type = 'ok';
    try {
      if (!Cloud.isLoggedIn()) {
        try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) {}
        location.reload();
        return;
      }
      await Cloud.sync();
      const st = Cloud.status();
      if (st.state === 'offline') { msg = 'Sem conexão'; type = 'err'; }
      else if (st.state === 'error') { msg = st.msg || 'Falha ao atualizar'; type = 'err'; }
      else render();
    } catch (e) { msg = 'Falha ao atualizar'; type = 'err'; }
    await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0))));
    hide();
    working = false;
    toast(msg, { type });
  }
  m.addEventListener('touchstart', (e) => {
    const bad = working || MQ_SHELL.matches || openSheetEl || m.scrollTop > 0 || e.touches.length !== 1 || e.target.closest('input,textarea,select,.dialog');
    if (bad) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; d = 0;
    ind.style.transition = 'none';
  }, { passive: true });
  m.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (m.scrollTop > 0 || dy <= 0 || Math.abs(dx) > dy) { d = 0; ind.style.opacity = '0'; return; }
    d = Math.min(MAX, dy * 0.5);
    place(d, d * 5);
  }, { passive: true });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    if (d >= TRIG) refresh(); else hide();
    d = 0;
  };
  m.addEventListener('touchend', end, { passive: true });
  m.addEventListener('touchcancel', end, { passive: true });
}
function init() {
  bindEvents();
  bindNative();
  bindPull();
  go('agenda');
  startCloud();
  scan();
  const relayout = () => go(ui.screen === 'patient' && master() ? 'patients' : ui.screen, true);
  [MQ_SHELL, MQ_WIDE].forEach((m) => (m.addEventListener ? m.addEventListener('change', relayout) : m.addListener(relayout)));
  setInterval(() => { scan(); if (MQ_SHELL.matches && ui.screen === 'agenda' && !openSheetEl) rAgenda(); }, 60000);
}
init();
