import { Cloud } from './cloud.js';
// Cole aqui a chave PÚBLICA VAPID (npx web-push generate-vapid-keys)
const VAPID_PUBLIC_KEY = 'COLE_AQUI_A_CHAVE_PUBLICA_VAPID';
const KEY = 'psi.push.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
const key64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pad = (n) => String(n).padStart(2, '0');
const UP = 'resolution=merge-duplicates,return=minimal';
let timer = null;
function wanted(state) {
  const out = {};
  const hide = read().hide !== false;
  const now = Date.now();
  const name = (id) => (state.patients.find((p) => p.id === id) || {}).name || '';
  const put = (id, d, t, title, body, url) => {
    const at = new Date(`${d}T${t}:00`).getTime();
    if (!(at > now) || at > now + 90 * 864e5) return;
    out[id] = { fire_at: new Date(at).toISOString(), payload: { title, body, tag: id, url, sound: state.settings.sound, vibrate: state.settings.vibrate } };
  };
  state.reminders.forEach((r) => {
    if (r.done || !r.dueDate) return;
    put('rm-' + r.id, r.dueDate, r.dueTime || '09:00', 'Lembrete', r.title + (!hide && r.patientId ? ' · ' + name(r.patientId) : ''), './?go=reminders');
  });
  state.appointments.forEach((a) => {
    if (!['agendada', 'confirmada'].includes(a.status) || !a.date || !a.startTime) return;
    const [h, m] = a.startTime.split(':').map(Number);
    const x = Math.max(0, h * 60 + m - state.settings.notifyMin);
    put('ap-' + a.id, a.date, `${pad(Math.floor(x / 60))}:${pad(x % 60)}`, 'Consulta em breve', hide ? `Consulta às ${a.startTime}` : `${a.startTime} · ${name(a.patientId)}`, `./?go=agenda&day=${a.date}`);
  });
  return out;
}
export const Push = {
  supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  configured: () => !VAPID_PUBLIC_KEY.startsWith('COLE_'),
  enabled: () => !!read().on && Push.supported() && Notification.permission === 'granted',
  hide: () => read().hide !== false,
  setHide(v, state) { write({ ...read(), hide: v, sched: {} }); Push.reconcile(state); },
  async init() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('sw.js'); } catch (e) { return null; }
  },
  async enable(state) {
    if (!Push.configured()) throw new Error('Configure a chave VAPID em push.js');
    if (!Cloud.isLoggedIn()) throw new Error('Entre na conta primeiro');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão negada');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key64(VAPID_PUBLIC_KEY) }));
    const j = sub.toJSON();
    await Cloud.api('push_subscriptions?on_conflict=endpoint', { method: 'POST', prefer: UP, body: [{ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }] });
    write({ ...read(), on: true, sched: {} });
    Push.reconcile(state, 0);
  },
  async disable() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await Cloud.api(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => {}); await sub.unsubscribe(); }
    } catch (e) {}
    write({ ...read(), on: false, sched: {} });
  },
  reconcile(state, ms = 2000) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!Push.enabled() || !Cloud.isLoggedIn()) return;
      const old = read().sched || {}, want = wanted(state), sched = {}, up = [], rm = [];
      for (const id in want) { const sig = JSON.stringify(want[id]); sched[id] = sig; if (old[id] !== sig) up.push({ id, ...want[id], sent_at: null }); }
      for (const id in old) if (!want[id]) rm.push(id);
      try {
        for (let i = 0; i < up.length; i += 100) await Cloud.api('scheduled_pushes?on_conflict=user_id,id', { method: 'POST', prefer: UP, body: up.slice(i, i + 100) });
        for (let i = 0; i < rm.length; i += 100) await Cloud.api(`scheduled_pushes?id=in.(${rm.slice(i, i + 100).map((x) => `"${x}"`).join(',')})`, { method: 'DELETE' });
        write({ ...read(), sched });
      } catch (e) { /* tenta de novo na próxima alteração */ }
    }, ms);
  },
  test: () => Cloud.api('scheduled_pushes?on_conflict=user_id,id', { method: 'POST', prefer: UP, body: [{ id: 'test', fire_at: new Date(Date.now() + 5000).toISOString(), sent_at: null, payload: { title: 'Teste', body: 'Notificações funcionando 🎉', tag: 'test', url: './' } }] }),
};
