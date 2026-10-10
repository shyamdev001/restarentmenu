import { useEffect, useState } from 'react';

function read(key, initial) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initial;
  } catch {
    return initial;
  }
}

/**
 * useState that survives a page refresh, and stays in step when the same page
 * is open in two tabs. Falls back to memory if storage is blocked.
 */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  }, [key, value]);

  // Another tab changed it: take that value instead of overwriting it later.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === key) setValue(read(key, initial)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}
