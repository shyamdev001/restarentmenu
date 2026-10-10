import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let pageLenis = null; // the page-level instance, when there is one

/** Jump the page back to the top, e.g. when moving to another section. */
export function scrollPageToTop() {
  if (pageLenis) pageLenis.scrollTo(0, { immediate: true, force: true });
  window.scrollTo(0, 0);
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Eased scrolling (Lenis) for mouse wheels and trackpads. Touch scrolling is
 * left to the phone, which already does it natively and better.
 *
 *   useSmoothScroll(true)              the page itself
 *   useSmoothScroll(open, () => el)    one scrolling element, while `open`
 */
export function useSmoothScroll(active, getElement) {
  useEffect(() => {
    if (!active || reducedMotion()) return undefined;
    const el = getElement?.();
    if (getElement && !el) return undefined;

    const lenis = new Lenis({
      ...(el ? { wrapper: el, content: el.firstElementChild || el } : {}),
      autoRaf: true, lerp: 0.14, wheelMultiplier: 1
    });

    if (!el) pageLenis = lenis;

    // Lists inside change height (search, live orders): keep the scroll limits right.
    const watcher = el ? new MutationObserver(() => lenis.resize()) : null;
    watcher?.observe(el, { childList: true, subtree: true });

    return () => { watcher?.disconnect(); if (pageLenis === lenis) pageLenis = null; lenis.destroy(); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
