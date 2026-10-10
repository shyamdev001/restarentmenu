import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from '../../lib/format.js';

const dayName = (day) => new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const clock = (date) => new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Past days: totals for each day that had orders, and every order of the day you pick. */
export default function HistoryPage({ settings, setError }) {
  const [days, setDays] = useState(null);
  const [day, setDay] = useState('');
  const [orders, setOrders] = useState(null);
  const currency = settings.currency;

  useEffect(() => {
    api.get('/admin/history').then((list) => { setDays(list); setDay((d) => d || list[0]?.day || ''); }).catch((e) => setError(e.message));
  }, [setError]);

  useEffect(() => {
    if (!day) return;
    setOrders(null);
    api.get('/admin/history/' + day).then(setOrders).catch((e) => setError(e.message));
  }, [day, setError]);

  const picked = days?.find((d) => d.day === day);

  return (
    <>
      <div className="a-title"><h1>Order <em>history</em></h1></div>
      {days && !days.length && <div className="a-empty">No orders in the last 60 days.</div>}

      {days?.length > 0 && (
        <div className="a-history">
          <nav className="a-card a-days" aria-label="Days" data-lenis-prevent>
            {days.map((d) => (
              <button key={d.day} className={'a-day' + (d.day === day ? ' is-on' : '')} aria-current={d.day === day ? 'true' : undefined} onClick={() => setDay(d.day)}>
                <span><b>{dayName(d.day)}</b><small>{d.orders} {d.orders === 1 ? 'order' : 'orders'} · {d.plates} {d.plates === 1 ? 'plate' : 'plates'}</small></span>
                <strong>{money(d.revenue, currency)}</strong>
              </button>
            ))}
          </nav>

          <section className="a-card">
            <h2 className="a-sub" style={{ marginBottom: 8 }}>{day && dayName(day)}{picked && <span className="a-muted a-small">{money(picked.revenue, currency)} in sales</span>}</h2>
            {!orders && <p className="a-muted">Loading…</p>}
            {orders && (
              <div className="a-scroll">
                <table className="a-table">
                  <thead><tr><th>Order</th><th>Time</th><th>Table</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td>#{o.number}</td>
                        <td className="a-muted">{clock(o.createdAt)}</td>
                        <td>{o.table}</td>
                        <td>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                        <td>{money(o.total, currency)}</td>
                        <td className={o.status === 'cancelled' ? 'a-error' : 'a-ok'}>{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
