import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { tableName } from '../../lib/format.js';

const COLUMNS = [
  { status: 'new', title: 'To start', from: 'createdAt', action: 'Start cooking', next: 'cooking', needs: 'cook' },
  { status: 'cooking', title: 'Cooking', from: 'cookingAt', action: 'Ready', next: 'ready', needs: 'cook' },
  { status: 'ready', title: 'Ready for pickup', from: 'readyAt', action: 'Served', next: 'served', needs: 'serve' }
];

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 86400) return `${Math.floor(s / 86400)}d+`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A button that fires only when held for a moment, so a wet hand brushing the
 * screen cannot move an order on. Enter or Space on a keyboard fires at once.
 */
function HoldButton({ label, onFire, tone = 'gold' }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef();
  const start = (e) => {
    if (e.button > 0) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onFire(); }, 550);
  };
  const stop = () => { clearTimeout(timer.current); setHolding(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button type="button" className={'k-hold is-' + tone + (holding ? ' is-holding' : '')}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFire(); } }}
      aria-label={`${label} (press and hold)`}>
      <i aria-hidden="true" />
      <span>{label}</span>
      <small>hold</small>
    </button>
  );
}

/** Lines the cook has ticked off, kept on this screen so a refresh does not lose them. */
function useTicks() {
  const [ticks, setTicks] = useState(() => { try { return JSON.parse(localStorage.getItem('sm.kitchenTicks')) || {}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('sm.kitchenTicks', JSON.stringify(ticks)); } catch { /* private mode */ } }, [ticks]);
  const toggle = (orderId, i) => setTicks((all) => {
    const mine = { ...(all[orderId] || {}) };
    mine[i] = !mine[i];
    return { ...all, [orderId]: mine };
  });
  return [ticks, toggle];
}

/**
 * The kitchen screen. Built for a tablet on the pass: large tickets in three
 * columns, a running clock on each that turns amber then red as the order runs
 * long, the total of each dish still to cook, hold-to-move buttons, and the
 * screen kept awake.
 */
export default function KitchenScreen({ orders, can, setError }) {
  const [now, setNow] = useState(Date.now());
  const [ticks, toggleTick] = useTicks();
  const [full, setFull] = useState(false);
  const root = useRef(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Keep the screen from going dark while it is up on the pass.
  useEffect(() => {
    let lock = null;
    const ask = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    ask();
    const again = () => { if (!document.hidden) ask(); };
    document.addEventListener('visibilitychange', again);
    return () => { document.removeEventListener('visibilitychange', again); lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.())?.catch?.(() => {});

  const live = useMemo(() => orders.filter((o) => ['new', 'cooking', 'ready'].includes(o.status))
    .slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [orders]);

  // How many of each dish are still to cook, across every order: what a chef calls the "all day".
  const allDay = useMemo(() => {
    const count = new Map();
    live.filter((o) => o.status !== 'ready').forEach((o) => o.items.forEach((i) => count.set(i.name, (count.get(i.name) || 0) + i.qty)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [live]);

  const move = (order, status) => api.patch(`/admin/orders/${order.id}`, { status }).catch((e) => setError(e.message));

  return (
    <section className={'k-screen' + (full ? ' is-full' : '')} ref={root} aria-label="Kitchen screen">
      <header className="k-head">
        <div>
          <h1>Kitchen</h1>
          <p className="k-clock">{new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
        <div className="k-counts">
          {COLUMNS.map((c) => <span key={c.status} className={'k-count is-' + c.status}><b>{live.filter((o) => o.status === c.status).length}</b>{c.title}</span>)}
        </div>
        <button className="a-btn" onClick={toggleFull}><Icon name="expand" size={16} />{full ? 'Leave full screen' : 'Full screen'}</button>
      </header>

      {allDay.length > 0 && (
        <div className="k-allday" aria-label="Still to cook, across all orders">
          <span className="k-allday__label">All day</span>
          {allDay.map(([name, n]) => <span key={name} className="k-allday__item"><b>{n}</b>{name}</span>)}
        </div>
      )}

      <div className="k-columns">
        {COLUMNS.map((col) => {
          const list = live.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className={'k-col is-' + col.status} aria-label={col.title}>
              <h2>{col.title}<span>{list.length}</span></h2>
              {!list.length && <p className="k-empty">{col.status === 'new' ? 'No new orders.' : col.status === 'cooking' ? 'Nothing on the fire.' : 'Nothing waiting.'}</p>}
              {list.map((o) => {
                const age = now - new Date(o.createdAt).getTime();
                const eta = Math.max(1, o.etaMin || 15) * 60000;
                const state = o.status === 'ready' ? '' : age > eta ? 'is-late' : age > eta * 0.75 ? 'is-warn' : '';
                const inStage = now - new Date(o[col.from] || o.createdAt).getTime();
                const mine = ticks[o.id] || {};
                return (
                  <article key={o.id} className={'k-ticket ' + state}>
                    <header>
                      <b>{tableName(o.table)}</b>
                      <span className="k-ticket__no">#{o.number}{o.source === 'staff' ? ` · by ${o.enteredBy || 'staff'}` : ''}</span>
                      <time className="k-ticket__clock" title="Time since the order came in">{clock(age)}</time>
                    </header>
                    <ul>
                      {o.items.map((item, i) => (
                        <li key={i}>
                          <button type="button" className={mine[i] ? 'is-done' : ''} onClick={() => toggleTick(o.id, i)} aria-pressed={!!mine[i]}>
                            <b>{item.qty}</b>
                            <span>{item.name}
                              {(item.spice || item.addons?.length > 0) && <small>{[item.spice, ...item.addons.map((a) => '+ ' + a.name)].filter(Boolean).join(' · ')}</small>}
                              {item.note && <em>“{item.note}”</em>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <footer>
                      <span className="k-ticket__stage">{col.status === 'new' ? 'waiting' : col.status === 'cooking' ? 'cooking' : 'ready'} {clock(inStage)}</span>
                      {can(col.needs)
                        ? <HoldButton label={col.action} tone={col.status === 'ready' ? 'green' : 'gold'} onFire={() => move(o, col.next)} />
                        : <span className="k-ticket__wait">{col.status === 'ready' ? 'For a waiter to serve' : ''}</span>}
                    </footer>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}
