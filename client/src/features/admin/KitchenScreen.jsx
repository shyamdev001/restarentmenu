import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { tableName } from '../../lib/format.js';

const COLUMNS = [
  { status: 'new', title: 'To start', short: 'New', from: 'createdAt', action: 'Start cooking', next: 'cooking', needs: 'cook', empty: 'No new orders. They appear here the moment a table sends one.' },
  { status: 'cooking', title: 'Cooking', short: 'Cooking', from: 'cookingAt', action: 'Ready', next: 'ready', needs: 'cook', empty: 'Nothing on the fire.' },
  { status: 'ready', title: 'Ready for pickup', short: 'Ready', from: 'readyAt', action: 'Served', next: 'served', needs: 'serve', empty: 'Nothing waiting at the pass.' }
];
const HOLD_MS = 550;
const FRESH_MS = 90000;   // how long a new ticket stays highlighted
const NARROW = 620;       // below this width the columns become tabs

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
function HoldButton({ label, onFire, tone = 'gold', busy }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef();
  const start = (e) => {
    if (busy || e.button > 0) return;
    // Keep the hold going if the finger slides a little; some browsers refuse, which is fine.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported for this pointer */ }
    setHolding(true);
    navigator.vibrate?.(8);
    timer.current = setTimeout(() => { setHolding(false); navigator.vibrate?.(30); onFire(); }, HOLD_MS);
  };
  const stop = () => { clearTimeout(timer.current); setHolding(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button type="button" className={'k-hold is-' + tone + (holding ? ' is-holding' : '')} disabled={busy}
      onPointerDown={start} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onFire(); } }}
      aria-label={`${label}. Press and hold.`}>
      <i aria-hidden="true" />
      <span>{busy ? 'Moving…' : label}</span>
      {!busy && <small aria-hidden="true">{holding ? 'keep holding' : 'hold'}</small>}
    </button>
  );
}

/** Lines the cook has ticked off, kept on this device so a refresh does not lose them. */
function useTicks(liveIds) {
  const [ticks, setTicks] = useState(() => { try { return JSON.parse(localStorage.getItem('sm.kitchenTicks')) || {}; } catch { return {}; } });
  // Forget orders that have left the kitchen, so the list never grows.
  const key = liveIds.join(',');
  useEffect(() => {
    setTicks((all) => {
      const kept = Object.fromEntries(Object.entries(all).filter(([id]) => liveIds.includes(id)));
      return Object.keys(kept).length === Object.keys(all).length ? all : kept;
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('sm.kitchenTicks', JSON.stringify(ticks)); } catch { /* private mode */ } }, [ticks]);
  const toggle = (orderId, i) => setTicks((all) => ({ ...all, [orderId]: { ...(all[orderId] || {}), [i]: !all[orderId]?.[i] } }));
  return [ticks, toggle];
}

function Ticket({ o, col, now, ticks, onTick, can, busy, error, onMove, others }) {
  const age = now - new Date(o.createdAt).getTime();
  const eta = Math.max(1, o.etaMin || 15) * 60000;
  const state = o.status === 'ready' ? '' : age > eta ? 'is-late' : age > eta * 0.75 ? 'is-warn' : '';
  const inStage = now - new Date(o[col.from] || o.createdAt).getTime();
  const fresh = o.status === 'new' && age < FRESH_MS;
  const done = o.items.filter((_, i) => ticks[i]).length;
  const plates = o.items.reduce((n, i) => n + i.qty, 0);
  return (
    <article className={['k-ticket', state, fresh && 'is-fresh'].filter(Boolean).join(' ')} aria-label={`${tableName(o.table)}, order ${o.number}`}>
      <header>
        <b>{tableName(o.table)}</b>
        <span className="k-ticket__no">#{o.number}{o.source === 'staff' ? ` · ${o.enteredBy || 'staff'}` : ''}</span>
        <time className="k-ticket__clock" title="Time since the order came in">{clock(age)}</time>
      </header>
      <div className="k-ticket__meta">
        {fresh && <span className="k-chip is-new">New</span>}
        {state === 'is-late' && <span className="k-chip is-late">Late</span>}
        {others > 0 && <span className="k-chip is-also">{others + 1} orders · same table</span>}
        <span>{plates} {plates === 1 ? 'plate' : 'plates'}</span>
        {done > 0 && <span>· {done} of {o.items.length} done</span>}
      </div>
      <ul>
        {o.items.map((item, i) => (
          <li key={i}>
            <button type="button" className={ticks[i] ? 'is-done' : ''} onClick={() => onTick(o.id, i)} aria-pressed={!!ticks[i]}>
              <b>{ticks[i] ? <Icon name="check" size={15} strokeWidth={3} /> : item.qty}</b>
              <span>{item.qty > 1 && ticks[i] ? `${item.qty} × ` : ''}{item.name}
                {(item.spice || item.addons?.length > 0) && <small>{[item.spice, ...(item.addons || []).map((a) => '+ ' + a.name)].filter(Boolean).join(' · ')}</small>}
                {item.note && <em>“{item.note}”</em>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="k-ticket__error" role="alert">{error}</p>}
      <footer>
        <span className="k-ticket__stage">{col.status === 'new' ? 'Waiting' : col.status === 'cooking' ? 'Cooking' : 'Ready'} {clock(inStage)}</span>
        {can(col.needs)
          ? <HoldButton label={col.action} tone={col.status === 'ready' ? 'green' : 'gold'} busy={busy} onFire={() => onMove(o, col.next)} />
          : <span className="k-ticket__wait">{col.status === 'ready' ? 'A waiter will take it' : ''}</span>}
      </footer>
    </article>
  );
}

/**
 * The kitchen screen. Built for a tablet on the pass: large tickets in three
 * columns (tabs on a phone), a running clock on each that turns amber then red
 * as the order runs long, the total of each dish still to cook, hold-to-move
 * buttons, and the screen kept awake.
 */
export default function KitchenScreen({ orders, can, connected }) {
  const [now, setNow] = useState(Date.now());
  const [full, setFull] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [view, setView] = useState(null);       // which column a phone shows; null = pick the busiest
  const [moving, setMoving] = useState({});     // order id -> true while its move is on the way
  const [errors, setErrors] = useState({});     // order id -> message
  const root = useRef(null);
  const canFull = typeof document !== 'undefined' && document.fullscreenEnabled;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Columns side by side when there is room, tabs when there is not. Measured on the screen itself, not the window.
  useEffect(() => {
    const el = root.current;
    if (!el || !window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < NARROW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const onChange = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => {
    const p = document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen();
    p?.catch?.(() => {});
  };

  const live = useMemo(() => orders.filter((o) => ['new', 'cooking', 'ready'].includes(o.status))
    .slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [orders]);
  const [ticks, toggleTick] = useTicks(live.map((o) => o.id));
  const byStatus = (s) => live.filter((o) => o.status === s);
  // A table with more than one order in: each ticket says so, so the food can go out together.
  const perTable = live.reduce((map, o) => (o.table > 0 ? map.set(o.table, (map.get(o.table) || 0) + 1) : map), new Map());

  // How many of each dish are still to cook, across every order: what a chef calls the "all day".
  const allDay = useMemo(() => {
    const count = new Map();
    live.filter((o) => o.status !== 'ready').forEach((o) => o.items.forEach((i, n) => {
      if (!ticks[o.id]?.[n]) count.set(i.name, (count.get(i.name) || 0) + i.qty);
    }));
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [live, ticks]);

  const move = async (order, status) => {
    setMoving((m) => ({ ...m, [order.id]: true }));
    setErrors((e) => ({ ...e, [order.id]: '' }));
    try { await api.patch(`/admin/orders/${order.id}`, { status }); }
    catch (e) { setErrors((all) => ({ ...all, [order.id]: e.message })); }
    finally { setMoving((m) => ({ ...m, [order.id]: false })); }
  };

  // On a phone, open on the column with the most waiting, unless the cook has picked one.
  const shown = view || (byStatus('new').length ? 'new' : byStatus('cooking').length ? 'cooking' : byStatus('ready').length ? 'ready' : 'new');
  const late = live.filter((o) => o.status !== 'ready' && now - new Date(o.createdAt).getTime() > Math.max(1, o.etaMin || 15) * 60000).length;

  return (
    <section className={'k-screen' + (full ? ' is-full' : '') + (narrow ? ' is-narrow' : '')} ref={root} aria-label="Kitchen screen">
      <header className="k-head">
        <div className="k-head__title">
          <h1>Kitchen</h1>
          <p className="k-clock">
            {new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {connected === false && <span className="k-offline"> · Reconnecting…</span>}
            {late > 0 && <span className="k-late"> · {late} running late</span>}
          </p>
        </div>
        {canFull && (
          <button className="a-btn" onClick={toggleFull} aria-pressed={full}>
            <Icon name="expand" size={16} /><span>{full ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        )}
      </header>

      {narrow && (
        <div className="k-tabs" role="tablist" aria-label="Order stage">
          {COLUMNS.map((c) => {
            const n = byStatus(c.status).length;
            return (
              <button key={c.status} role="tab" aria-selected={shown === c.status} className={'k-tab is-' + c.status + (shown === c.status ? ' is-on' : '')} onClick={() => setView(c.status)}>
                {c.short}<b>{n}</b>
              </button>
            );
          })}
        </div>
      )}

      {allDay.length > 0 && (
        <div className="k-allday" aria-label="Still to cook, across all orders">
          <span className="k-allday__label">All day</span>
          <div className="k-allday__list">
            {allDay.map(([name, n]) => <span key={name} className="k-allday__item"><b>{n}</b>{name}</span>)}
          </div>
        </div>
      )}

      <div className="k-columns">
        {COLUMNS.filter((c) => !narrow || c.status === shown).map((col) => {
          const list = byStatus(col.status);
          return (
            <section key={col.status} className={'k-col is-' + col.status} aria-label={col.title}>
              {!narrow && <h2>{col.title}<span>{list.length}</span></h2>}
              {!list.length && (
                <div className="k-empty">
                  <Icon name={col.status === 'new' ? 'receipt' : col.status === 'cooking' ? 'flame' : 'check'} size={22} />
                  <p>{col.empty}</p>
                </div>
              )}
              {list.map((o) => (
                <Ticket key={o.id} o={o} col={col} now={now} ticks={ticks[o.id] || {}} onTick={toggleTick} can={can}
                  busy={!!moving[o.id]} error={errors[o.id]} onMove={move} others={(perTable.get(o.table) || 1) - 1} />
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}
