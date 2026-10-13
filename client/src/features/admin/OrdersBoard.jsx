import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';
import { money, tableName, timeAgo } from '../../lib/format.js';
import NewOrder from './NewOrder.jsx';

const COLUMNS = [
  { status: 'new', title: 'New', next: 'cooking', action: 'Start cooking' },
  { status: 'cooking', title: 'Cooking', next: 'ready', action: 'Mark ready' },
  { status: 'ready', title: 'Ready to serve', next: 'served', action: 'Served' }
];

function OrderCard({ order, column, currency, onStatus }) {
  return (
    <article className={'a-card a-order' + (order.status === 'new' ? ' is-new' : '')}>
      <div className="a-order__top">
        <b>{tableName(order.table)}</b>
        <span className="a-muted a-small">#{order.number} · {timeAgo(order.createdAt)}{order.source === 'staff' ? ' · by staff' : ''}</span>
      </div>
      <ul>
        {order.items.map((item, i) => {
          const extras = [item.spice, ...item.addons.map((a) => '+ ' + a.name)].filter(Boolean).join(' · ');
          return (
            <li key={i}>
              <b>{item.qty} ×</b> {item.name}
              {extras && <small>{extras}</small>}
              {item.note && <small>Note: “{item.note}”</small>}
            </li>
          );
        })}
      </ul>
      <div className="a-muted a-small">Total {money(order.total, currency)} incl. tax</div>
      <div className="a-order__foot">
        <button className="a-btn is-gold" onClick={() => onStatus(order, column.next)}>{column.action}</button>
        {(order.status === 'new' || order.status === 'cooking') && <button className="a-btn is-danger" onClick={() => onStatus(order, 'cancelled')}>Cancel</button>}
      </div>
    </article>
  );
}

export default function OrdersBoard({ orders, calls, stats, settings, setError, openTables, loadTables, menu, open, onOpened, onSending }) {
  const [entering, setEntering] = useState(false);
  // Arriving from a shortcut or the search box with "enter an order": open the form straight away.
  useEffect(() => { if (open?.newOrder) { setEntering(true); onOpened?.(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  const currency = settings.currency;
  const [confirm, dialog] = useConfirm();
  const setStatus = async (order, status) => {
    if (status === 'cancelled' && !(await confirm({
      title: `Cancel order #${order.number}?`,
      body: order.table === 0 ? 'This cannot be undone.' : `Table ${order.table} will be told their order was cancelled. This cannot be undone.`,
      action: 'Cancel the order', cancel: 'Keep the order'
    }))) return;
    api.patch(`/admin/orders/${order.id}`, { status }).catch((e) => setError(e.message));
  };
  const markPaid = async (t) => {
    const yes = await confirm({
      title: `${tableName(t.table)} has paid?`,
      body: `This closes ${t.orders === 1 ? 'its order' : `its ${t.orders} orders`} (${money(t.total, currency)}). The guests' phones start a fresh visit.`,
      action: 'Mark as paid', cancel: 'Not yet'
    });
    if (yes) api.post(`/admin/tables/${t.table}/settle`).then(loadTables).catch((e) => setError(e.message));
  };
  const doneCall = (call) => api.patch(`/admin/calls/${call.id}`).catch((e) => setError(e.message));
  const history = orders.filter((o) => o.status === 'served' || o.status === 'cancelled').slice(0, 30);

  return (
    <>
      {dialog}
      {entering && <NewOrder menu={menu} settings={settings} onClose={() => setEntering(false)} onSent={() => setEntering(false)} onSending={onSending} />}
      <div className="a-title">
        <h1>Live <em>orders</em></h1>
        <button className="a-btn is-gold" onClick={() => setEntering(true)}><Icon name="plus" size={16} />New order</button>
      </div>
      <div className="a-stats">
        <div className="a-stat"><b>{stats.active}</b><span>Active orders</span></div>
        <div className="a-stat"><b>{stats.orders}</b><span>Orders today</span></div>
        <div className="a-stat"><b>{stats.items}</b><span>Plates today</span></div>
        <div className="a-stat"><b>{money(stats.revenue, currency)}</b><span>Sales today</span></div>
      </div>

      {calls.length > 0 && (
        <section>
          <h2 className="a-sub" style={{ marginBottom: 12 }}><Icon name="bell" />Tables asking for you</h2>
          <div className="a-calls">
            {calls.map((call) => (
              <div key={call.id} className="a-call">
                Table {call.table}: {call.type === 'bill' ? 'wants the bill' : 'needs a server'}
                <button className="a-btn is-gold" onClick={() => doneCall(call)}>Done</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {openTables.length > 0 && (
        <section>
          <h2 className="a-sub" style={{ marginBottom: 12 }}><Icon name="receipt" />Open tables</h2>
          <div className="a-tables">
            {openTables.map((t) => (
              <div key={t.table} className="a-opentable">
                <span><b>{tableName(t.table)}</b><small>{t.orders} {t.orders === 1 ? 'order' : 'orders'}{t.active ? ` · ${t.active} in the kitchen` : ' · all served'}</small></span>
                <strong>{money(t.total, currency)}</strong>
                <button className="a-btn" disabled={t.active > 0} onClick={() => markPaid(t)}>Mark paid</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="a-board">
        {COLUMNS.map((column) => {
          const list = orders.filter((o) => o.status === column.status).slice().reverse();
          return (
            <section key={column.status} className="a-col" aria-label={column.title}>
              <h2 className="a-sub">{column.title}{list.length > 0 && <span className="a-badge">{list.length}</span>}</h2>
              {list.map((o) => <OrderCard key={o.id} order={o} column={column} currency={currency} onStatus={setStatus} />)}
              {!list.length && <div className="a-empty">Nothing here.</div>}
            </section>
          );
        })}
      </div>

      {history.length > 0 && (
        <section className="a-card">
          <h2 className="a-sub" style={{ marginBottom: 8 }}>Recent</h2>
          <div className="a-scroll">
            <table className="a-table">
              <thead><tr><th>Order</th><th>Table</th><th>Items</th><th>Total</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.number}</td>
                    <td>{o.table}</td>
                    <td>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                    <td>{money(o.total, currency)}</td>
                    <td className={o.status === 'cancelled' ? 'a-error' : 'a-ok'}>{o.status}</td>
                    <td className="a-muted">{timeAgo(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
