import Sheet, { Stepper } from './Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { fullName, money } from '../../lib/format.js';

const STEPS = [
  ['new', 'Order received'],
  ['cooking', 'On the fire'],
  ['ready', 'On its way to your table'],
  ['served', 'Served. Enjoy.']
];

/** Live progress of one order, driven by the kitchen's status changes. */
export function OrderTracker({ order }) {
  if (order.status === 'cancelled') {
    return (
      <div className="c-track">
        <div className="c-track__title">Order #{order.number} was cancelled.</div>
        <p className="c-muted" style={{ fontSize: 14 }}>Please ask your server if this is unexpected.</p>
      </div>
    );
  }
  const at = STEPS.findIndex(([status]) => status === order.status);
  return (
    <div className="c-track" aria-live="polite">
      <div>
        <div className="c-eyebrow c-gold" style={{ marginBottom: 6 }}>Order #{order.number}</div>
        <div className="c-track__title">
          {order.status === 'served' ? 'On your table.' : `About ${order.etaMin} minutes to your table.`}
        </div>
      </div>
      {STEPS.map(([status, label], i) => (
        <div key={status} className={'c-step' + (i <= at ? ' is-done' : '') + (i === at && status !== 'served' ? ' is-now' : '')}>
          <i>{i < at || status === order.status && status === 'served' ? <Icon name="check" size={14} strokeWidth={3} /> : null}</i>
          {label}
        </div>
      ))}
    </div>
  );
}

export default function OrderSheet({ open, onClose, lines, currency, eta, total, onQty, onSend, sending, orders, onCall, onBill, alerts, onAlerts }) {
  const active = orders.filter((o) => o.status !== 'served').slice().reverse();
  return (
    <Sheet open={open} onClose={onClose} title="Your" accent="order" tall>
      <div className="c-body c-rail" style={{ gap: 14 }}>
        {active.map((o) => <OrderTracker key={o.id} order={o} />)}
        {active.length > 0 && alerts === 'default' && (
          <button className="c-alerts c-press" onClick={onAlerts}>
            <Icon name="bell" size={16} />
            <span><b>Alert me when it moves</b><small>Get a notification on this phone, even with the menu closed.</small></span>
          </button>
        )}

        <div>
          {lines.map(({ dish, qty, option, unit }) => {
            const extras = [option.spice, ...dish.addons.filter((a) => option.addons[a.name]).map((a) => a.name), option.note && `“${option.note}”`].filter(Boolean);
            return (
              <div key={dish.id} className="c-line">
                <div style={{ minWidth: 0 }}>
                  <b>{fullName(dish)}</b>
                  {extras.length > 0 && <small>{extras.join(' · ')}</small>}
                  <strong>{money(unit * qty, currency)}</strong>
                </div>
                <Stepper value={qty} onChange={(v) => onQty(dish.id, v)} />
              </div>
            );
          })}
          {!lines.length && !active.length && <p className="c-empty">Nothing here yet.<br />Add a plate to begin.</p>}
        </div>
      </div>

      {lines.length > 0 && (
        <>
          <div className="c-eta"><Icon name="clock" size={16} />Ready in about {eta} minutes</div>
          <div className="c-total">
            <span className="c-eyebrow c-muted">Total before tax</span>
            <b>{money(total, currency)}</b>
          </div>
        </>
      )}
      <div className="c-pair">
        <button className="c-ghost c-press" onClick={() => onCall('waiter')}>Call a server</button>
        <button className="c-ghost c-press" onClick={onBill}>View the bill</button>
      </div>
      <button className="c-cta is-gold c-press" disabled={!lines.length || sending} onClick={onSend}>
        {sending ? 'Sending…' : 'Send to the kitchen'}
      </button>
    </Sheet>
  );
}
