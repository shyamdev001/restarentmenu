import { useEffect, useState } from 'react';

const KEY = 'sm.theme';
const BAR = { light: '#f8f1e5', dark: '#080503' }; // the phone's browser bar

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[theme]);
}

/** Call once before the first render so the page never opens in the wrong theme. */
export function initTheme() { apply(getTheme()); }

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  // Where the browser can, cross-fade the whole page instead of snapping.
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => apply(theme));
  } else {
    apply(theme);
  }
  window.dispatchEvent(new CustomEvent('sm:theme', { detail: theme }));
}

/** [theme, toggle] : the current theme and a function that flips it. Remembered on this device. */
export function useTheme() {
  const [theme, set] = useState(getTheme);
  useEffect(() => {
    const onChange = (e) => set(e.detail);
    // Another tab of the menu or admin changed it: follow along.
    const onStorage = (e) => { if (e.key === KEY) { apply(getTheme()); set(getTheme()); } };
    window.addEventListener('sm:theme', onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('sm:theme', onChange); window.removeEventListener('storage', onStorage); };
  }, []);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
