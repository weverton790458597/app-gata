// app.js — lógica central do Foco (tarefas + Pomodoro + estatísticas)
import { Storage, normalize } from './storage.js';
import { Cloud } from './cloud.js';

/* ============================================================
   Utilitários
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m} min`);
const RING_LEN = 2 * Math.PI * 90; // circunferência do anel (r = 90)

const PRIORITY = {
  alta: { label: 'Alta', rank: 0 },
  media: { label: 'Média', rank: 1 },
  baixa: { label: 'Baixa', rank: 2 },
};
const MODES = {
  focus: { label: 'Foco' },
  short: { label: 'Pausa curta' },
  long: { label: 'Pausa longa' },
};
const TITLES = { tasks: 'Tarefas', focus: 'Foco', stats: 'Estatísticas', settings: 'Ajustes' };

/* ============================================================
   Estado
   ============================================================ */
let state = Storage.load();
const ui = {
  screen: 'tasks',
  filter: 'all',
  query: '',
  loading: true,
  editingId: null,
  formPriority: 'media',
};

const save = () => { Storage.save(state); Cloud.touch(); };

function tap(ms = 8) {
  if (state.settings.vibrate && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* ignora */ }
  }
}

/* ============================================================
   Toasts
   ============================================================ */
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast glass' + (opts.type ? ' ' + opts.type : '');
  const span = document.createElement('span');
  span.textContent = msg;
  el.append(span);

  let timer;
  const remove = () => {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  };

  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opts.action.label;
    b.onclick = () => { opts.action.fn(); remove(); };
    el.append(b);
  }

  const box = $('#toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  box.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  timer = setTimeout(remove, opts.duration || 3200);
}

/* ============================================================
   Navegação
   ============================================================ */
function go(name) {
  ui.screen = name;
  $('#app').dataset.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  $$('.nav button[data-go]').forEach((b) => {
    const on = b.dataset.go === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $('#screen-title').textContent = TITLES[name];
  $('#main').scrollTo({ top: 0 });
  if (name === 'stats') renderStats();
  if (name === 'focus') renderTimer();
}

/* ============================================================
   Sheets e diálogo
   ============================================================ */
let openSheetEl = null;

function openSheet(el) {
  closeSheet();
  openSheetEl = el;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  $('#backdrop').classList.add('open');
  document.body.classList.add('lock');
}

function closeSheet() {
  if (!openSheetEl) return;
  openSheetEl.classList.remove('open');
  openSheetEl.setAttribute('aria-hidden', 'true');
  openSheetEl = null;
  $('#backdrop').classList.remove('open');
  document.body.classList.remove('lock');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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

/* ============================================================
   Tarefas
   ============================================================ */
function formatDue(due) {
  const today = dayKey();
  const tomorrow = dayKey(Date.now() + 86400000);
  if (due === today) return 'Hoje';
  if (due === tomorrow) return 'Amanhã';
  const [, m, d] = due.split('-');
  return `${d}/${m}`;
}

function visibleTasks() {
  const today = dayKey();
  const q = ui.query.trim().toLowerCase();
  const list = state.tasks.filter((t) => {
    if (q && !(t.title.toLowerCase().includes(q) || t.project.toLowerCase().includes(q))) return false;
    switch (ui.filter) {
      case 'today':
        return (!t.done && t.due && t.due <= today) || (t.done && t.doneAt && dayKey(t.doneAt) === today);
      case 'pending': return !t.done;
      case 'done': return t.done;
      default: return true;
    }
  });
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pr = PRIORITY[a.priority].rank - PRIORITY[b.priority].rank;
    if (pr) return pr;
    if (a.due !== b.due) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
  return list;
}

function taskEl(t, index) {
  const today = dayKey();
  const overdue = !t.done && t.due && t.due < today;
  const li = document.createElement('li');
  li.className = 'task' + (t.done ? ' done' : '');
  li.dataset.id = t.id;
  li.dataset.p = t.priority;
  li.style.animationDelay = Math.min(index, 8) * 40 + 'ms';
  li.innerHTML = `
    <button class="check" data-act="toggle" type="button" aria-label="Alternar conclusão"><svg class="ic"><use href="#i-check"/></svg></button>
    <div class="task-main">
      <div class="task-top">
        <div class="task-title" data-act="edit"></div>
        <button class="pill-btn" data-act="focus" type="button" aria-label="Focar nesta tarefa">Focar</button>
      </div>
      <div class="task-rows" data-act="edit">
        <div class="trow t-due${overdue ? ' over' : ''}"><span class="ri"><svg class="ic"><use href="#i-clock"/></svg></span><span class="rt"></span></div>
        <div class="trow t-info"><span class="ri p"><svg class="ic"><use href="#i-flag"/></svg></span><span class="rt"></span>
          <button class="icon-btn" data-act="delete" type="button" aria-label="Excluir tarefa"><svg class="ic"><use href="#i-trash"/></svg></button>
        </div>
      </div>
    </div>`;
  $('.task-title', li).textContent = t.title;
  $('.t-due .rt', li).textContent = t.due ? (overdue ? 'Atrasada · ' : '') + formatDue(t.due) : 'Sem prazo';

  const info = [PRIORITY[t.priority].label];
  if (t.project) info.push(t.project);
  if (t.pomodoros) info.push(`${t.pomodoros} ${t.pomodoros > 1 ? 'sessões' : 'sessão'}`);
  $('.t-info .rt', li).textContent = info.join(' · ');
  return li;
}

function renderTasks() {
  const list = $('#task-list');
  const empty = $('#task-empty');
  list.innerHTML = '';

  if (ui.loading) {
    empty.hidden = true;
    for (let i = 0; i < 4; i++) {
      const sk = document.createElement('li');
      sk.className = 'sk';
      list.append(sk);
    }
    return;
  }

  const items = visibleTasks();
  items.forEach((t, i) => list.append(taskEl(t, i)));

  empty.hidden = items.length > 0;
  if (!items.length) {
    const filtering = ui.query || ui.filter !== 'all';
    $('#empty-title').textContent = filtering ? 'Nada encontrado' : 'Nenhuma tarefa por aqui';
    $('#empty-sub').textContent = filtering
      ? 'Tente outro filtro ou termo de busca.'
      : 'Toque no botão + para criar sua primeira tarefa.';
  }
  renderSummary();
}

function renderGreeting() {
  $('#hello-name').textContent = state.settings.name || 'bem-vinda';
}

function renderSummary() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('#sum-text').textContent = `${done} de ${total} concluída${done === 1 ? '' : 's'}`;
  $('#sum-pct').textContent = pct + '%';
  $('#sum-bar').style.width = pct + '%';
  $('#streak-badge').textContent = computeStreak();
}

function openTaskSheet(id = null) {
  ui.editingId = id;
  const t = id ? state.tasks.find((x) => x.id === id) : null;
  $('#sheet-task-title').textContent = t ? 'Editar tarefa' : 'Nova tarefa';
  $('#f-title').value = t ? t.title : '';
  $('#f-project').value = t ? t.project : '';
  $('#f-due').value = t ? t.due : '';
  $('#f-title').classList.remove('err');
  setFormPriority(t ? t.priority : 'media');

  const projects = [...new Set(state.tasks.map((x) => x.project).filter(Boolean))];
  const dl = $('#projects');
  dl.innerHTML = '';
  projects.forEach((p) => {
    const o = document.createElement('option');
    o.value = p;
    dl.append(o);
  });

  openSheet($('#sheet-task'));
  if (!t) setTimeout(() => $('#f-title').focus(), 380);
}

function setFormPriority(p) {
  ui.formPriority = p;
  $$('#f-prio button').forEach((b) => b.classList.toggle('active', b.dataset.p === p));
}

function submitTask(e) {
  e.preventDefault();
  const title = $('#f-title').value.trim();
  if (!title) {
    const f = $('#f-title');
    f.classList.remove('err');
    void f.offsetWidth; // reinicia a animação
    f.classList.add('err');
    tap(30);
    f.focus();
    return;
  }
  const data = {
    title: title.slice(0, 120),
    priority: ui.formPriority,
    project: $('#f-project').value.trim().slice(0, 30),
    due: $('#f-due').value || '',
  };
  if (ui.editingId) {
    const t = state.tasks.find((x) => x.id === ui.editingId);
    if (t) Object.assign(t, data);
    toast('Tarefa atualizada', { type: 'ok' });
  } else {
    state.tasks.push({ id: uid(), ...data, done: false, doneAt: null, createdAt: Date.now(), pomodoros: 0 });
    toast('Tarefa criada', { type: 'ok' });
  }
  save();
  tap(12);
  closeSheet();
  renderTasks();
}

function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  if (t.done && state.activeTaskId === id) state.activeTaskId = null;
  save();
  tap(14);
  renderTasks();
  renderFocusTask();
  if (t.done) toast('Tarefa concluída', { type: 'ok' });
}

function deleteTask(id, el) {
  const idx = state.tasks.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const removed = state.tasks[idx];
  const wasActive = state.activeTaskId === id;
  tap(18);
  const finish = () => {
    state.tasks.splice(idx, 1);
    if (wasActive) state.activeTaskId = null;
    save();
    renderTasks();
    renderFocusTask();
    toast('Tarefa excluída', {
      duration: 5000,
      action: {
        label: 'Desfazer',
        fn: () => {
          state.tasks.splice(Math.min(idx, state.tasks.length), 0, removed);
          if (wasActive) state.activeTaskId = removed.id;
          save();
          renderTasks();
          renderFocusTask();
        },
      },
    });
  };
  if (el) {
    el.classList.add('removing');
    setTimeout(finish, 280);
  } else {
    finish();
  }
}

function focusOnTask(id) {
  state.activeTaskId = id;
  save();
  renderFocusTask();
  go('focus');
  const t = state.tasks.find((x) => x.id === id);
  if (t) toast(`Foco em: ${t.title}`);
}

/* ============================================================
   Temporizador (Pomodoro)
   Usa timestamp de término (endAt): continua correto mesmo se o
   app ficar em segundo plano ou for fechado e reaberto.
   ============================================================ */
function durations() {
  const s = state.settings;
  return { focus: s.focus * 60, short: s.short * 60, long: s.long * 60 };
}

function timerDefault(mode = 'focus') {
  const total = durations()[mode];
  return { mode, running: false, endAt: null, remaining: total, total };
}

function secsLeft() {
  const t = state.timer;
  return t.running ? Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000)) : t.remaining;
}

function startTimer() {
  const t = state.timer;
  if (t.running) return;
  if (t.remaining <= 0) t.remaining = t.total;
  t.running = true;
  t.endAt = Date.now() + t.remaining * 1000;
  save();
  tap(15);
  renderTimer();
}

function pauseTimer() {
  const t = state.timer;
  if (!t.running) return;
  t.remaining = secsLeft();
  t.running = false;
  t.endAt = null;
  save();
  tap(10);
  renderTimer();
}

function setMode(mode) {
  state.timer = timerDefault(mode);
  save();
  renderTimer();
}

function beep() {
  if (!state.settings.sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.26, 0.52].forEach((d, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 988 : 784;
      const t0 = ctx.currentTime + d;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.26);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (e) { /* ignora */ }
}

function advanceMode(wasMode) {
  if (wasMode === 'focus') {
    return state.cycle > 0 && state.cycle % state.settings.longEvery === 0 ? 'long' : 'short';
  }
  if (wasMode === 'long') state.cycle = 0;
  return 'focus';
}

function completeTimer() {
  const t = state.timer;
  const was = t.mode;
  if (was === 'focus') {
    state.sessions.push({
      id: uid(),
      taskId: state.activeTaskId || null,
      minutes: Math.max(1, Math.round(t.total / 60)),
      ts: Date.now(),
    });
    const task = state.tasks.find((x) => x.id === state.activeTaskId);
    if (task) task.pomodoros = (task.pomodoros || 0) + 1;
    state.cycle += 1;
  }
  const next = advanceMode(was);
  state.timer = timerDefault(next);
  save();

  beep();
  if (state.settings.vibrate && navigator.vibrate) {
    try { navigator.vibrate([220, 120, 220, 120, 400]); } catch (e) { /* ignora */ }
  }
  toast(was === 'focus' ? 'Sessão concluída! Hora de descansar.' : 'Pausa terminou. Vamos focar!', { type: 'ok', duration: 4500 });
  renderTimer();
  renderTasks();
  if (ui.screen === 'stats') renderStats();
}

function skipTimer() {
  const was = state.timer.mode;
  const next = advanceMode(was);
  state.timer = timerDefault(next);
  save();
  tap(12);
  renderTimer();
}

function renderTimer() {
  const t = state.timer;
  const left = secsLeft();
  $('#time').textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  $('#mode-label').textContent = MODES[t.mode].label;
  $('#screen-focus').dataset.mode = t.mode;
  $$('#mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === t.mode));
  $('#ring-fg').style.strokeDashoffset = (RING_LEN * (1 - left / t.total)).toFixed(2);

  const btn = $('#btn-toggle');
  btn.innerHTML = `<svg class="ic"><use href="#${t.running ? 'i-pause' : 'i-play'}"/></svg>`;
  btn.setAttribute('aria-label', t.running ? 'Pausar' : 'Iniciar');

  const n = state.settings.longEvery;
  const filled = state.cycle > 0 && state.cycle % n === 0 ? n : state.cycle % n;
  const dots = $('#dots');
  if (dots.children.length !== n) {
    dots.innerHTML = '';
    for (let i = 0; i < n; i++) dots.append(document.createElement('i'));
  }
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i < filled));
  $('#cycle-hint').textContent = `${filled} de ${n} sessões até a pausa longa`;
}

function renderFocusTask() {
  const t = state.tasks.find((x) => x.id === state.activeTaskId);
  const btn = $('#active-task');
  btn.classList.toggle('has', !!t);
  $('#active-task-label').textContent = t ? t.title : 'Escolher tarefa para focar';
}

function openPicker() {
  const list = $('#picker-list');
  list.innerHTML = '';
  const mk = (label, id, sub) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (state.activeTaskId === id ? ' sel' : '');
    const s = document.createElement('span');
    s.textContent = label;
    b.append(s);
    if (sub) {
      const sm = document.createElement('small');
      sm.textContent = sub;
      b.append(sm);
    }
    b.onclick = () => {
      state.activeTaskId = id;
      save();
      tap(10);
      closeSheet();
      renderFocusTask();
    };
    li.append(b);
    list.append(li);
  };
  mk('Sem tarefa específica', null);
  state.tasks
    .filter((t) => !t.done)
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank)
    .forEach((t) => mk(t.title, t.id, PRIORITY[t.priority].label));
  openSheet($('#sheet-picker'));
}

function tick() {
  if (state.timer && state.timer.running) {
    if (secsLeft() <= 0) completeTimer();
    else if (ui.screen === 'focus') renderTimer();
  }
}

/* ============================================================
   Estatísticas
   ============================================================ */
function activeDaysSet() {
  const set = new Set();
  state.sessions.forEach((s) => set.add(dayKey(s.ts)));
  state.tasks.forEach((t) => { if (t.done && t.doneAt) set.add(dayKey(t.doneAt)); });
  return set;
}

function computeStreak() {
  const days = activeDaysSet();
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function renderStats() {
  const today = dayKey();
  const minutesOn = (key) => state.sessions.filter((s) => dayKey(s.ts) === key).reduce((a, s) => a + s.minutes, 0);
  const doneToday = state.tasks.filter((t) => t.done && t.doneAt && dayKey(t.doneAt) === today).length;
  const streak = computeStreak();
  const totalMin = state.sessions.reduce((a, s) => a + s.minutes, 0);
  const totalDone = state.tasks.filter((t) => t.done).length;
  const rate = state.tasks.length ? Math.round((totalDone / state.tasks.length) * 100) : 0;

  $('#st-focus').textContent = fmtMin(minutesOn(today));
  $('#st-done').textContent = doneToday;
  $('#st-streak').textContent = `${streak} dia${streak === 1 ? '' : 's'}`;
  $('#st-sessions').textContent = state.sessions.length;
  $('#st-total-time').textContent = fmtMin(totalMin);
  $('#st-total-done').textContent = totalDone;
  $('#st-rate').textContent = rate + '%';

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      key: dayKey(d),
      label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      min: minutesOn(dayKey(d)),
    });
  }
  const max = Math.max(1, ...days.map((d) => d.min));
  const weekTotal = days.reduce((a, d) => a + d.min, 0);
  $('#st-week-total').textContent = fmtMin(weekTotal);

  const chart = $('#chart');
  chart.innerHTML = '';
  const bars = [];
  days.forEach((d) => {
    const col = document.createElement('div');
    col.className = 'col' + (d.min === 0 ? ' zero' : '') + (d.key === today ? ' today' : '');
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = d.min ? d.min : '';
    const b = document.createElement('div');
    b.className = 'b';
    const l = document.createElement('div');
    l.className = 'd';
    l.textContent = d.label;
    col.append(v, b, l);
    chart.append(col);
    bars.push([b, d.min]);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bars.forEach(([b, m]) => { b.style.height = m ? Math.max(6, (m / max) * 100) * 0.78 + '%' : '6px'; });
  }));
  $('#streak-badge').textContent = streak;
}

/* ============================================================
   Ajustes e dados
   ============================================================ */
function renderSettings() {
  $$('[data-setting]').forEach((inp) => {
    const v = state.settings[inp.dataset.setting];
    if (inp.type === 'checkbox') inp.checked = !!v;
    else inp.value = v;
  });
}

function bindSettings() {
  $$('[data-setting]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.setting;
      if (inp.type === 'checkbox') {
        state.settings[key] = inp.checked;
        tap(10);
      } else if (inp.type === 'text') {
        state.settings[key] = inp.value.trim().slice(0, 20);
        inp.value = state.settings[key];
        renderGreeting();
      } else {
        const min = Number(inp.min);
        const max = Number(inp.max);
        let v = Math.round(Number(inp.value)) || min;
        v = Math.min(max, Math.max(min, v));
        inp.value = v;
        state.settings[key] = v;
        const t = state.timer;
        if (!t.running && t.remaining === t.total) state.timer = timerDefault(t.mode);
      }
      save();
      renderTimer();
      toast('Ajustes salvos', { type: 'ok', duration: 1800 });
    });
  });

  $('#btn-export').onclick = () => {
    try {
      const blob = new Blob([Storage.export(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `foco-backup-${dayKey()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('Backup exportado', { type: 'ok' });
    } catch (e) {
      toast('Não foi possível exportar. Use "Copiar".', { type: 'err' });
    }
  };

  $('#btn-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(Storage.export(state));
      toast('Backup copiado para a área de transferência', { type: 'ok' });
    } catch (e) {
      toast('Cópia bloqueada pelo sistema', { type: 'err' });
    }
  };

  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = Storage.parse(await file.text());
      const ok = await confirmDialog(
        'Importar backup?',
        `Isto substituirá os dados atuais por ${incoming.tasks.length} tarefa(s) e ${incoming.sessions.length} sessão(ões).`,
        'Importar'
      );
      if (!ok) return;
      state = incoming;
      if (!state.timer) state.timer = timerDefault();
      Cloud.markFull();
      save();
      renderAll();
      toast('Backup importado', { type: 'ok' });
    } catch (err) {
      toast(err.message || 'Falha ao importar', { type: 'err' });
    }
  };

  $('#btn-reset-all').onclick = async () => {
    const ok = await confirmDialog('Apagar tudo?', `Todas as tarefas, sessões e ajustes serão removidos ${Cloud.isLoggedIn() ? 'deste aparelho e da nuvem' : 'deste aparelho'}. Esta ação não pode ser desfeita.`, 'Apagar');
    if (!ok) return;
    state = Storage.reset();
    state.timer = timerDefault();
    Cloud.markFull();
    save();
    renderAll();
    toast('Dados apagados');
  };
}


/* ============================================================
   Conta (sincronização com a nuvem)
   ============================================================ */
function renderCloud() {
  const st = Cloud.status();
  const on = Cloud.isLoggedIn();
  $('#cloud-out').hidden = on;
  $('#cloud-in').hidden = !on;
  const labels = {
    unconfigured: 'Não configurado',
    out: 'Desconectado',
    idle: 'Conectado',
    syncing: 'Sincronizando…',
    ok: 'Sincronizado',
    offline: 'Sem conexão',
    error: 'Erro ao sincronizar',
  };
  $('#cloud-status').textContent = labels[st.state] || '';
  $('#cl-who').textContent = Cloud.email();
  const last = Cloud.lastSync();
  $('#cl-last').textContent = st.state === 'error' && st.msg
    ? st.msg
    : last ? 'Última sincronização: ' + new Date(last).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Ainda não sincronizado';
  if (!Cloud.isConfigured()) $('#cl-login').disabled = true;
}

function startCloud() {
  Cloud.init({
    getState: () => state,
    apply: (r) => {
      // Dados da nuvem substituem tarefas/sessões/ajustes; timer e ciclo ficam locais.
      state = normalize({ ...state, tasks: r.tasks, sessions: r.sessions, settings: r.settings || state.settings });
      if (!state.timer) state.timer = timerDefault();
      Storage.save(state); // sem save(): não deve marcar como pendente
      renderAll();
    },
    onStatus: renderCloud,
  });
  renderCloud();
  Cloud.start();
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
      renderCloud();
      toast('Conectado', { type: 'ok' });
      Cloud.start();
    } catch (e) {
      toast(e.message || 'Falha no login', { type: 'err' });
    } finally {
      btn.disabled = !Cloud.isConfigured();
    }
  };
  $('#cl-sync').onclick = () => Cloud.sync();
  $('#cl-logout').onclick = async () => {
    const ok = await confirmDialog('Sair da conta?', 'Os dados continuam neste aparelho, mas deixam de ser sincronizados.', 'Sair');
    if (!ok) return;
    Cloud.logout();
    renderCloud();
  };
}

/* ============================================================
   Render geral e inicialização
   ============================================================ */
function renderAll() {
  renderGreeting();
  renderTasks();
  renderSummary();
  renderTimer();
  renderFocusTask();
  renderSettings();
  if (ui.screen === 'stats') renderStats();
}

function bindEvents() {
  // Navegação
  $$('.nav button[data-go]').forEach((b) => b.addEventListener('click', () => { tap(8); go(b.dataset.go); }));
  $('#btn-streak').addEventListener('click', () => {
    const s = computeStreak();
    toast(s ? `${s} dia${s > 1 ? 's' : ''} seguido${s > 1 ? 's' : ''} de atividade` : 'Conclua uma tarefa ou sessão hoje para iniciar sua sequência');
  });

  // Tarefas
  $('#fab').addEventListener('click', () => { tap(10); openTaskSheet(); });
  $('#search').addEventListener('input', (e) => { ui.query = e.target.value; renderTasks(); });
  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    ui.filter = c.dataset.filter;
    $$('.chip').forEach((x) => x.classList.toggle('active', x === c));
    tap(6);
    renderTasks();
  });
  $('#task-list').addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    const li = e.target.closest('.task');
    if (!actEl || !li) return;
    const id = li.dataset.id;
    switch (actEl.dataset.act) {
      case 'toggle': toggleTask(id); break;
      case 'edit': openTaskSheet(id); break;
      case 'focus': focusOnTask(id); break;
      case 'delete': deleteTask(id, li); break;
    }
  });

  // Sheet de tarefa
  $('#sheet-task').addEventListener('submit', submitTask);
  $('#f-cancel').addEventListener('click', closeSheet);
  $('#f-prio').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { setFormPriority(b.dataset.p); tap(6); }
  });
  $('#f-title').addEventListener('input', (e) => e.target.classList.remove('err'));
  $('#backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // Timer
  $('#btn-toggle').addEventListener('click', () => (state.timer.running ? pauseTimer() : startTimer()));
  $('#btn-reset').addEventListener('click', () => { setMode(state.timer.mode); tap(10); });
  $('#btn-skip').addEventListener('click', skipTimer);
  $('#mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.mode === state.timer.mode) return;
    tap(8);
    setMode(b.dataset.mode);
  });
  $('#active-task').addEventListener('click', openPicker);

  // Retoma o relógio quando o app volta ao primeiro plano
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderTimer(); } });
  window.addEventListener('pagehide', () => Storage.save(state));

  bindSettings();
  bindCloud();
}

function init() {
  if (!state.timer) state.timer = timerDefault();
  $('#screen-sub').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  bindEvents();
  renderGreeting();
  renderSettings();
  renderFocusTask();
  renderTimer();
  renderTasks(); // mostra skeletons

  // Se o timer terminou enquanto o app estava fechado
  if (state.timer.running && secsLeft() <= 0) completeTimer();

  go('tasks');
  setTimeout(() => {
    ui.loading = false;
    renderTasks();
  }, 450);

  startCloud();
  setInterval(tick, 250);
}

init();
