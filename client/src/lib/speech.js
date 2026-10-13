/**
 * Speaking aloud, with the voices built into the browser. Nothing is sent
 * anywhere by this code and nothing is paid for. Used by the admin to call
 * out orders.
 *
 * How natural it sounds depends on the device. Microsoft Edge ships realistic
 * "Natural" voices (including Indian English) for free; Chrome and Android have
 * good Google voices; older Windows voices sound robotic. The best one found is
 * picked automatically, and the owner can choose another under the bell.
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const store = {
  get: (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
};

export const canSpeak = () => !!synth && typeof window.SpeechSynthesisUtterance === 'function';

export const voiceOn = () => store.get('sm.voice', '1') !== '0';
export function setVoiceOn(on) { store.set('sm.voice', on ? '1' : '0'); if (!on) stopSpeaking(); }

/** How fast it talks. A kitchen wants it brisk: the default is a little quicker than normal speech. */
export const SPEEDS = [['Calm', 1.2], ['Brisk', 1.5], ['Fast', 1.8]];
export const voiceRate = () => Number(store.get('sm.voiceRate', '1.5')) || 1.5;

/** How much is said: the whole order, or only where it is for (the dishes still show on screen). */
export const voiceDetail = () => (store.get('sm.voiceDetail', 'full') === 'short' ? 'short' : 'full');
export const setVoiceDetail = (detail) => store.set('sm.voiceDetail', detail);
export const setVoiceRate = (rate) => store.set('sm.voiceRate', String(rate));

export const chosenVoice = () => store.get('sm.voiceName', '');
export const setChosenVoice = (name) => store.set('sm.voiceName', name);

/** Higher is more natural. Neural and "Natural" voices first, Indian English preferred, old robotic voices last. */
function score(v) {
  let s = 0;
  if (v.lang === 'en-IN') s += 40; else if (v.lang === 'en-GB') s += 22; else if (v.lang === 'en-US') s += 18; else s += 10;
  if (/natural|neural|online/i.test(v.name)) s += 60;
  else if (/google|siri|enhanced|premium/i.test(v.name)) s += 30;
  if (/\b(david|zira|mark|hazel|heera|ravi|george|susan|espeak|compact)\b/i.test(v.name) && !/natural|online/i.test(v.name)) s -= 15;
  return s;
}
const qualityOf = (v) => (/natural|neural|online/i.test(v.name) ? 'Natural' : /google|siri|enhanced|premium/i.test(v.name) ? 'Good' : 'Basic');

/** The English voices on this device, most natural first: [{ name, label, quality }]. */
export function listVoices() {
  if (!canSpeak()) return [];
  return synth.getVoices().filter((v) => v.lang.startsWith('en')).sort((a, b) => score(b) - score(a))
    .map((v) => ({ name: v.name, quality: qualityOf(v), label: v.name.replace(/^Microsoft |^Google /, '').replace(/ Online \(Natural\)/, '').replace(/ - English \(.+\)$/, '') + (v.lang === 'en-IN' ? ' · Indian English' : v.lang === 'en-GB' ? ' · British' : v.lang === 'en-US' ? ' · American' : '') }));
}

/** Browsers fill in their voice list a moment after the page opens: run `fn` whenever it changes. */
export function onVoices(fn) {
  if (!canSpeak()) return () => {};
  synth.addEventListener?.('voiceschanged', fn);
  return () => synth.removeEventListener?.('voiceschanged', fn);
}

function currentVoice() {
  const voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
  return voices.find((v) => v.name === chosenVoice()) || voices.sort((a, b) => score(b) - score(a))[0] || null;
}

if (canSpeak()) { try { synth.getVoices(); } catch { /* not ready */ } }

export function stopSpeaking() {
  try { synth?.cancel(); } catch { /* nothing playing */ }
}

/**
 * Say several lines as one flowing sentence (no gaps between them), reporting
 * which line is being spoken so the screen can light it up in step.
 *   onLine(i)  line i has started
 *   onEnd()    called once, when it finishes (or cannot speak)
 * Returns a function that stops it early.
 */
export function speakLines(lines, { onLine, onEnd } = {}) {
  let stopped = false;
  let done = false;
  const timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers.length = 0; };
  const finish = () => { if (!done) { done = true; clear(); onEnd?.(); } };
  const rate = voiceRate();

  let shown = -1;
  const show = (i) => { if (i > shown && !stopped) { shown = i; onLine?.(i); } };

  // Reading pace when the browser gives no word-by-word timing (or cannot speak at all):
  // with line `current` on screen now, light each later line when its turn would come.
  // Returns how long the rest will take.
  const duration = (line) => (300 + line.length * 56) / rate;
  const paced = (current = 0) => {
    clear();
    let at = duration(lines[current] || '');
    for (let i = current + 1; i < lines.length; i += 1) {
      const index = i;
      timers.push(setTimeout(() => show(index), at));
      at += duration(lines[i]);
    }
    return at;
  };

  if (!canSpeak() || !voiceOn()) {
    show(0);
    timers.push(setTimeout(finish, paced(0) + 200));
    return () => { stopped = true; clear(); };
  }

  // Where each line begins in the full sentence, so a spoken word can be matched back to its line.
  const starts = [];
  let text = '';
  lines.forEach((line) => { starts.push(text.length); text += line.replace(/[.\s]+$/, '') + '. '; });

  const say = new SpeechSynthesisUtterance(text.trim());
  const voice = currentVoice();
  if (voice) { say.voice = voice; say.lang = voice.lang; } else { say.lang = 'en-IN'; }
  say.rate = rate;
  say.pitch = 1;
  say.volume = 1;

  let exact = false;      // true once the browser reports word positions

  say.onstart = () => {
    show(0);
    // Until (and unless) word positions arrive, keep step by estimate.
    const total = paced(0);
    // Some browsers never report the end while in the background: do not leave the screen stuck.
    timers.push(setTimeout(finish, total + 4000));
  };
  say.onboundary = (e) => {
    if (!exact) { exact = true; const guard = timers.pop(); clear(); if (guard) timers.push(guard); }
    let i = 0;
    while (i + 1 < starts.length && e.charIndex >= starts[i + 1]) i += 1;
    show(i);
  };
  say.onend = () => { show(lines.length - 1); finish(); };
  // A refusal comes back at once (no tap on the page yet, or no voice): keep the reading pace in silence.
  say.onerror = () => { if (done) return; show(0); timers.push(setTimeout(finish, paced(Math.max(0, shown)) + 200)); };

  stopSpeaking();
  try { synth.speak(say); } catch { say.onerror(); }
  return () => { stopped = true; clear(); stopSpeaking(); };
}
