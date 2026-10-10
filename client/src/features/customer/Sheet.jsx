import { useEffect, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import { useSmoothScroll } from '../../lib/useSmoothScroll.js';

/** Bottom sheet. Always mounted so it can slide in and out. */
export default function Sheet({ open, onClose, eyebrow, title, accent, tall, label, children }) {
  const root = useRef(null);
  // Whichever part scrolls in this layout: the body, or the whole drawer on short screens.
  useSmoothScroll(open, () => {
    const body = root.current?.querySelector('.c-body');
    return body && getComputedStyle(body).overflowY !== 'visible' ? body : root.current;
  });

  // Keyboard and screen-reader users land inside the sheet, and return to where they were.
  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    root.current?.querySelector('.c-x')?.focus({ preventScroll: true });
    return () => { if (before instanceof HTMLElement && document.contains(before)) before.focus({ preventScroll: true }); };
  }, [open]);

  return (
    <section ref={root} className={'c-sheet' + (open ? ' is-open' : '') + (tall ? ' is-tall' : '')}
      aria-label={label || `${title} ${accent || ''}`} aria-hidden={!open} inert={open ? undefined : ''}>
      <div className="c-grab" />
      <div className="c-sheet__head">
        <div>
          <h2>{title} {accent && <em>{accent}</em>}</h2>
          {eyebrow && <div className="c-eyebrow c-muted">{eyebrow}</div>}
        </div>
        <button className="c-x c-press" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      {children}
    </section>
  );
}

export function Stepper({ value, onChange, min = 0, big }) {
  return (
    <div className={'c-stepper' + (big ? ' is-big' : '')}>
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Less">−</button>
      <b>{value}</b>
      <button onClick={() => onChange(value + 1)} aria-label="More">+</button>
    </div>
  );
}
