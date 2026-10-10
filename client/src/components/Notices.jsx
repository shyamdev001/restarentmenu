import { useCallback, useState } from 'react';
import Icon from './Icon.jsx';
import { buzz, flashTitle, play, systemNotice } from '../lib/notify.js';
import '../styles/notices.css';

let nextId = 0;

/**
 * Live notices, shared by the guest menu and the admin panel.
 *
 * push({ title, body, icon, tone, sound, vibrate, important, action, ttl, tag })
 *   tone       'gold' (default) or 'bad'
 *   important  also lights the edge of the screen, blinks the tab title and rings the icon
 *   action     run when the notice itself is tapped
 */
export function useNotices() {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
    setTimeout(() => setItems((list) => list.filter((n) => n.id !== id)), 320);
  }, []);

  const push = useCallback((notice) => {
    const item = { id: ++nextId, tone: 'gold', icon: 'bell', ttl: 7000, ...notice };
    setItems((list) => [item, ...list].slice(0, 4));
    if (item.sound) play(item.sound);
    if (item.vibrate) buzz(item.vibrate === true ? undefined : item.vibrate);
    if (item.important) flashTitle(item.title);
    systemNotice(item.title, item.body, item.tag);
    return item;
  }, []);

  return { items, push, dismiss };
}

/** `aside` moves the stack clear of a drawer that is open on the right edge of a wide screen. */
export default function Notices({ items, onDismiss, aside = false }) {
  const loud = items.find((n) => n.important && !n.leaving);
  return (
    <div className={'n-stack' + (aside ? ' is-aside' : '')}>
      {loud && <i key={loud.id} className={'n-flash is-' + loud.tone} aria-hidden="true" />}
      {items.map((n) => (
        <div key={n.id} role={n.important ? 'alert' : 'status'}
          className={`n-card is-${n.tone}` + (n.important ? ' is-loud' : '') + (n.leaving ? ' is-leaving' : '')}>
          <button className="n-main" onClick={() => { n.action?.(); onDismiss(n.id); }}>
            <span className="n-icon"><Icon name={n.icon} size={20} /></span>
            <span className="n-text">
              <b>{n.title}</b>
              {n.body && <span>{n.body}</span>}
            </span>
          </button>
          <button className="n-x" onClick={() => onDismiss(n.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          {/* The draining line is also the timer: the notice leaves when it runs out, and waits while hovered. */}
          <i className="n-bar" style={{ animationDuration: n.ttl + 'ms' }} onAnimationEnd={() => onDismiss(n.id)} />
        </div>
      ))}
    </div>
  );
}
