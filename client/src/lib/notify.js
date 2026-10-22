/**
 * Everything that gets someone's attention outside the page itself:
 * sound, vibration, a system notification and a blinking tab title.
 * Each one is a nicety, so every call here fails silently.
 */

const MUTE_KEY = 'sm.mute';

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
}

/* ---------------------------------- Sound ---------------------------------- */
let ctx = null;

function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Browsers only allow sound after a tap or click, so wake the audio on the first one.
let woken = false;
const wakers = new Set();
if (typeof window !== 'undefined') {
  const wake = () => {
    try { audio(); } catch { /* no audio */ }
    if (!woken) { woken = true; wakers.forEach((fn) => fn()); wakers.clear(); }
  };
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake, { passive: true });
}

/** False until the first tap or key press on this page: before that the browser plays nothing. */
export const soundReady = () => woken;
/** Run `fn` once sound becomes possible. Returns a function that cancels the wait. */
export function onSoundReady(fn) {
  if (woken) { fn(); return () => {}; }
  wakers.add(fn);
  return () => wakers.delete(fn);
}

// Each sound is a short run of bell notes: [frequency, start (s), length (s)].
const SOUNDS = {
  order: { volume: 0.22, notes: [[659, 0, 0.5], [784, 0.12, 0.5], [988, 0.24, 0.5], [1319, 0.36, 0.8]] },
  call: { volume: 0.24, notes: [[988, 0, 0.7], [784, 0.3, 1]] },
  good: { volume: 0.2, notes: [[784, 0, 0.45], [1175, 0.14, 0.45], [1568, 0.28, 0.8]] },
  soft: { volume: 0.12, notes: [[880, 0, 0.4], [1175, 0.1, 0.5]] },
  bad: { volume: 0.18, notes: [[330, 0, 0.5], [247, 0.22, 0.8]] },
  nag: { volume: 0.1, notes: [[784, 0, 0.35]] }
};

export function play(kind) {
  if (isMuted()) return;
  try {
    const a = audio();
    const sound = SOUNDS[kind];
    if (!a || !sound) return;
    sound.notes.forEach(([freq, at, length]) => {
      // A fundamental plus a quiet octave above it reads as a small bell rather than a beep.
      [[freq, 1, 'sine'], [freq * 2, 0.28, 'triangle']].forEach(([f, share, type]) => {
        const osc = a.createOscillator();
        const gain = a.createGain();
        const start = a.currentTime + at;
        osc.type = type;
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(sound.volume * share, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        osc.connect(gain).connect(a.destination);
        osc.start(start);
        osc.stop(start + length + 0.05);
      });
    });
  } catch { /* sound is a nicety */ }
}

export function buzz(pattern = [120, 60, 120]) {
  try { if (!isMuted()) navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/* --------------------------- System notifications --------------------------- */
/** 'unsupported' | 'default' (can ask) | 'granted' | 'denied' */
export function alertsState() {
  if (typeof window === 'undefined' || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  return Notification.permission;
}

export async function askForAlerts() {
  if (alertsState() !== 'default') return alertsState();
  try { await Notification.requestPermission(); } catch { /* dismissed */ }
  return alertsState();
}

/** Needed on Android, where a page can only show notifications through a service worker. */
export function registerWorker() {
  try {
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
  } catch { /* not supported */ }
}

/* ------------------------------- Real push --------------------------------- */
let pushOn = false; // once the server can push to this browser, the page stops raising its own

const toBytes = (base64) => {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

async function post(url, body) {
  const res = await fetch('/api' + url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Push subscription was not saved.');
}

/**
 * Subscribe this browser to real push notifications, which arrive even when the
 * page is closed. Safe to call again: it also tells the server what to listen for.
 *   enablePush('admin')                        every new order and table call
 *   enablePush('guest', { orders, table })     this guest's orders and table
 * Resolves true when the subscription is saved.
 */
/** This browser's push subscription, made if needed, without telling the server what it is for. Null if not possible. */
export async function pushSubscription() {
  try {
    if (alertsState() !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const worker = await navigator.serviceWorker.ready;
    let subscription = await worker.pushManager.getSubscription();
    if (!subscription) {
      const { publicKey } = await fetch('/api/push/key').then((r) => r.json());
      subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) });
    }
    return subscription.toJSON();
  } catch {
    return null;
  }
}

export async function enablePush(role, scope = {}) {
  try {
    const subscription = await pushSubscription();
    if (!subscription) return false;
    const body = { subscription, ...(role === 'guest' ? scope : {}) };
    await post(role === 'admin' ? '/admin/push/subscribe' : '/push/subscribe', body);
    pushOn = true;
    return true;
  } catch {
    pushOn = false;
    return false;
  }
}

/** Shown only while the page is in the background: in front, the in-page notice is enough. */
export async function systemNotice(title, body, tag) {
  if (pushOn || alertsState() !== 'granted' || !document.hidden) return;
  const options = { body, tag, renotify: !!tag, icon: '/icon-192.png', badge: '/icon-192.png' };
  try {
    const worker = await navigator.serviceWorker?.getRegistration();
    if (worker?.showNotification) { await worker.showNotification(title, options); return; }
    const note = new Notification(title, options);
    note.onclick = () => { window.focus(); note.close(); };
  } catch { /* blocked */ }
}

/* -------------------------------- Tab title -------------------------------- */
let baseTitle = typeof document !== 'undefined' ? document.title : '';
let flashTimer = null;

/** Set the tab title through here so a blinking alert can put it back correctly. */
export function setBaseTitle(title) {
  baseTitle = title;
  if (!flashTimer) document.title = title;
}

function stopFlash() {
  clearInterval(flashTimer);
  flashTimer = null;
  document.title = baseTitle;
}

/** Blink a message in the tab title until someone comes back to the tab. */
export function flashTitle(message) {
  if (!document.hidden) return;
  clearInterval(flashTimer);
  let on = false;
  flashTimer = setInterval(() => { on = !on; document.title = on ? message : baseTitle; }, 900);
  document.title = message;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden && flashTimer) stopFlash(); });
}
