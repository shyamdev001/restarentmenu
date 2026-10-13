/**
 * Speaking aloud, with the voice built into the browser. Nothing is sent
 * anywhere and nothing is paid for. Used by the admin to call out orders.
 */

const KEY = 'sm.voice';
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export const canSpeak = () => !!synth && typeof window.SpeechSynthesisUtterance === 'function';

export function voiceOn() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setVoiceOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  if (!on) stopSpeaking();
}

/** The clearest English voice on this device: Indian English first, then British, then any English. */
function pickVoice() {
  const voices = synth.getVoices();
  const by = (test) => voices.find(test);
  return by((v) => v.lang === 'en-IN' && /google|natural|neural/i.test(v.name))
    || by((v) => v.lang === 'en-IN')
    || by((v) => v.lang === 'en-GB')
    || by((v) => v.lang.startsWith('en'))
    || null;
}

// Some browsers only fill in their voice list after first being asked.
if (canSpeak()) { try { synth.getVoices(); } catch { /* not ready */ } }

export function stopSpeaking() {
  try { synth?.cancel(); } catch { /* nothing playing */ }
}

/**
 * Say several lines one after another.
 *   onLine(i)  called as line i starts, so the screen can light it up in step
 *   onEnd()    called once, when the last line finishes (or speaking is not possible)
 * Returns a function that stops it early.
 */
export function speakLines(lines, { onLine, onEnd } = {}) {
  let stopped = false;
  let done = false;
  const finish = () => { if (!done) { done = true; onEnd?.(); } };

  // No voice here (or it is switched off): still walk through the lines at reading pace.
  if (!canSpeak() || !voiceOn()) {
    let i = 0;
    const step = () => {
      if (stopped) return;
      if (i >= lines.length) { finish(); return; }
      onLine?.(i);
      i += 1;
      setTimeout(step, 1100);
    };
    step();
    return () => { stopped = true; };
  }

  const voice = pickVoice();
  let i = 0;
  // If the browser never reports the end of a line (some do not while in the background), move on anyway.
  let guard;
  const next = () => {
    clearTimeout(guard);
    if (stopped) return;
    if (i >= lines.length) { finish(); return; }
    const index = i;
    i += 1;
    const say = new SpeechSynthesisUtterance(lines[index]);
    if (voice) { say.voice = voice; say.lang = voice.lang; } else { say.lang = 'en-IN'; }
    say.rate = 0.96;
    say.pitch = 1;
    const began = Date.now();
    say.onstart = () => onLine?.(index);
    say.onend = next;
    // A refusal comes back at once (no tap on the page yet, or no voice): still give the line its moment on screen.
    say.onerror = () => { onLine?.(index); clearTimeout(guard); guard = setTimeout(next, Math.max(0, 1100 - (Date.now() - began))); };
    guard = setTimeout(() => { onLine?.(index); next(); }, 2500 + lines[index].length * 90);
    try { synth.speak(say); } catch { next(); }
  };
  stopSpeaking();
  next();
  return () => { stopped = true; clearTimeout(guard); stopSpeaking(); };
}
