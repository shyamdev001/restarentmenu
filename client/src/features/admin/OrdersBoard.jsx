import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';
import { money, tableName, timeAgo } from '../../lib/format.js';
import NewOrder from './NewOrder.jsx';
import Receipt from './Receipt.jsx';

const PAY_METHODS = [['cash', 'Cash', 'cash'], ['upi', 'UPI', 'qr'], ['card', 'Card', 'card']];

const COLUMNS = [
  { status: 'new', title: 'New', next: 'cooking', action: 'Start cooking', needs: 'cook' },
  { status: 'cooking', title: 'Cooking', next: 'ready', action: 'Mark ready', needs: 'cook' },
  { status: 'ready', title: 'Ready to serve', next: 'served', action: 'Served', needs: 'serve' }
];

/**
 * One order on the board. Staff who may cancel can also take dishes off an
 * order that is not ready yet: tap Change, lower the numbers, save.
 */
function OrderCard({ order, column, currency, onStatus, can, others, setError }) {
  const [trim, setTrim] = useState(null);   // the quantities while changing, one per line
  const [saving, setSaving] = useState(false);
  const changeable = can('cancel') && (order.status === 'new' || order.status === 'cooking');
  useEffect(() => { if (!changeable) setTrim(null); }, [changeable]);

  const subtotal = trim ? order.items.reduce((n, item, i) => n + item.unitPrice * trim[i], 0) : order.subtotal;
  const left = trim ? trim.reduce((n, q) => n + q, 0) : 1;
  const save = async () => {
    const items = trim.map((qty, index) => ({ index, qty })).filter(({ index, qty }) => qty !== order.items[index].qty);
    if (!items.length) { setTrim(null); return; }
    setSaving(true);
    try { await api.patch(`/admin/orders/${order.id}/items`, { items }); setTrim(null); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <article className={'a-card a-order' + (order.status === 'new' ? ' is-new' : '') + (trim ? ' is-changing' : '')}>
      <div className="a-order__top">
        <b>{tableName(order.table)}</b>
        <span className="a-muted a-small">#{order.number} · {timeAgo(order.createdAt)}{order.source === 'staff' ? ` · by ${order.enteredBy || 'staff'}` : ''}</span>
        {others > 0 && <span className="a-sibling">{others + 1} orders from this table</span>}
      </div>
      <ul>
        {order.items.map((item, i) => {
          const extras = [item.spice, ...item.addons.map((a) => '+ ' + a.name)].filter(Boolean).join(' · ');
          return (
            <li key={i} className={trim && trim[i] === 0 ? 'is-removed' : ''}>
              {trim ? (
                <span className="a-trim" role="group" aria-label={`How many ${item.name}`}>
                  <button type="button" className="a-trim__btn" aria-label={`One less ${item.name}`} disabled={trim[i] === 0} onClick={() => setTrim(trim.map((q, n) => (n === i ? q - 1 : q)))}>−</button>
                  <b>{trim[i]}</b>
                  <button type="button" className="a-trim__btn" aria-label={`One more ${item.name}`} disabled={trim[i] >= item.qty} onClick={() => setTrim(trim.map((q, n) => (n === i ? q + 1 : q)))}>+</button>
                </span>
              ) : <b>{item.qty} ×</b>} {item.name}
              {extras && <small>{extras}</small>}
              {item.note && <small>Note: “{item.note}”</small>}
            </li>
          );
        })}
      </ul>
      {order.prize?.win && <div className="a-prize"><Icon name="star" size={14} />Won on the wheel: {order.prize.label}</div>}
      <div className="a-muted a-small">
        {trim ? `New total ${money(subtotal * (1 + order.taxPercent / 100), currency)} incl. tax` : `Total ${money(order.total, currency)} incl. tax`}
      </div>
      {trim ? (
        <div className="a-order__foot">
          <button className={'a-btn ' + (left ? 'is-gold' : 'is-danger')} disabled={saving} onClick={save}>{saving ? 'Saving…' : left ? 'Save changes' : 'Cancel the whole order'}</button>
          <button className="a-btn" disabled={saving} onClick={() => setTrim(null)}>Keep as it was</button>
        </div>
      ) : (
        <div className="a-order__foot">
          {can(column.needs) && <button className="a-btn is-gold" onClick={() => onStatus(order, column.next)}>{column.action}</button>}
          {changeable && <button className="a-btn" onClick={() => setTrim(order.items.map((i) => i.qty))}><Icon name="pen" size={15} />Change</button>}
          {can('cancel') && (order.status === 'new' || order.status === 'cooking') && <button className="a-btn is-danger" onClick={() => onStatus(order, 'cancelled')}>Cancel</button>}
        </div>
      )}
    </article>
  );
}

export default function OrdersBoard({ can, orders, calls, stats, settings, setError, openTables, loadTables, menu, open, onOpened, onSending }) {
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
  // Marking paid is one tap on how the money came in: cash, UPI or card. That tap closes the table.
  const [paying, setPaying] = useState(null);   // the table whose payment choice is open
  const [settling, setSettling] = useState(false);
  const markPaid = async (t, method) => {
    setSettling(true);
    try { await api.post(`/admin/tables/${t.table}/settle`, { method }); setPaying(null); loadTables(); }
    catch (e) { setError(e.message); }
    finally { setSettling(false); }
  };
  // Printing a table's bill, and moving a party to another table.
  const [printing, setPrinting] = useState(null);
  const [moving, setMoving] = useState(null);   // { from, to }
  const move = async (e) => {
    e.preventDefault();
    try { await api.post(`/admin/tables/${moving.from}/move`, { to: Number(moving.to) }); setMoving(null); loadTables(); }
    catch (err) { setError(err.message); }
  };
  // A club member at the table has a reward waiting: staff hand it over and it comes off their card.
  const giveReward = async (m) => {
    if (!(await confirm({ title: `Give ${m.name.split(' ')[0]} their reward?`, body: `${settings.club?.reward || 'The reward'}. It comes off their stamp card.`, action: 'Reward given', cancel: 'Not yet' }))) return;
    api.post(`/admin/guests/${m.id}/redeem`).then(loadTables).catch((e) => setError(e.message));
  };
  // How many orders are live at each table, so a second ticket from the same table says so.
  const liveAt = orders.reduce((map, o) => (['new', 'cooking', 'ready'].includes(o.status) && o.table > 0 ? map.set(o.table, (map.get(o.table) || 0) + 1) : map), new Map());
  const doneCall = (call) => api.patch(`/admin/calls/${call.id}`).catch((e) => setError(e.message));
  const history = orders.filter((o) => o.status === 'served' || o.status === 'cancelled').slice(0, 30);

  return (
    <>
      {dialog}
      {printing !== null && <Receipt table={printing} settings={settings} onClose={() => setPrinting(null)} />}
      {entering && <NewOrder menu={menu} settings={settings} onClose={() => setEntering(false)} onSent={() => setEntering(false)} onSending={onSending} />}
      <div className="a-title">
        <h1>Live <em>orders</em></h1>
        {can('enter') && <button className="a-btn is-gold" onClick={() => setEntering(true)}><Icon name="plus" size={16} />New order</button>}
      </div>
      <div className="a-stats">
        <div className="a-stat"><b>{stats.active}</b><span>Active orders</span></div>
        <div className="a-stat"><b>{stats.orders}</b><span>Orders today</span></div>
        <div className="a-stat"><b>{stats.items}</b><span>Plates today</span></div>
        {can('reports') && <div className="a-stat"><b>{money(stats.revenue, currency)}</b><span>Sales today</span></div>}
      </div>

      {calls.length > 0 && (
        <section>
          <h2 className="a-sub" style={{ marginBottom: 12 }}><Icon name="bell" />Tables asking for you</h2>
          <div className="a-calls">
            {calls.map((call) => (
              <div key={call.id} className="a-call">
                Table {call.table}: {call.type === 'bill' ? 'wants the bill' : 'needs a server'}
                {can('calls') && <button className="a-btn is-gold" onClick={() => doneCall(call)}>Done</button>}
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
              <div key={t.table} className={'a-opentable' + (t.parties > 1 ? ' is-stale' : '')}>
                <span className="a-opentable__who"><b>{tableName(t.table)}</b><small>{t.orders} {t.orders === 1 ? 'order' : 'orders'}{t.active ? ` · ${t.active} in the kitchen` : ' · all served'}</small>
                  {t.parties > 1 && <small className="a-opentable__warn">Includes an earlier party that was not marked paid</small>}
                </span>
                {t.members?.length > 0 && (
                  <span className="a-members">
                    {t.members.map((m) => (
                      <span key={m.id} className={'a-member' + (m.rewardsReady ? ' has-reward' : '')}>
                        <Icon name="heart" size={13} />{m.name.split(' ')[0]}
                        {m.rewardsReady > 0 ? <>: reward waiting{can('settle') && <button className="a-member__give" onClick={() => giveReward(m)}>Give</button>}</> : ` · ${m.stamps} stamps`}
                      </span>
                    ))}
                  </span>
                )}
                <strong>{money(t.total, currency)}</strong>
                {can('settle') && (
                  <span className="a-opentable__tools">
                    <button className="a-btn" onClick={() => setPrinting(t.table)}><Icon name="print" size={15} />Bill</button>
                    {t.table > 0 && <button className="a-btn" aria-expanded={moving?.from === t.table} onClick={() => { setMoving(moving?.from === t.table ? null : { from: t.table, to: '' }); setPaying(null); }}>Move</button>}
                    <button className="a-btn is-gold" disabled={t.active > 0} aria-expanded={paying === t.table} title={t.active ? 'Wait until everything is served' : undefined}
                      onClick={() => { setPaying(paying === t.table ? null : t.table); setMoving(null); }}>Mark paid</button>
                  </span>
                )}
                {paying === t.table && (
                  <div className="a-opentable__pay" role="group" aria-label={`How ${tableName(t.table)} paid ${money(t.total, currency)}`}>
                    <span>Paid {money(t.total, currency)} by</span>
                    {PAY_METHODS.map(([method, label, icon]) => (
                      <button key={method} className="a-paymethod" disabled={settling} onClick={() => markPaid(t, method)}>
                        <Icon name={icon} size={18} />{label}
                      </button>
                    ))}
                    <button className="a-btn" disabled={settling} onClick={() => setPaying(null)}>Not yet</button>
                  </div>
                )}
                {moving?.from === t.table && (
                  <form className="a-opentable__move" onSubmit={move}>
                    <label className="a-label">Move this party to
                      <select required value={moving.to} onChange={(e) => setMoving({ ...moving, to: e.target.value })}>
                        <option value="" disabled>Choose a table</option>
                        {Array.from({ length: settings.tables }, (_, i) => i + 1).filter((n) => n !== t.table).map((n) => (
                          <option key={n} value={n}>Table {n}{openTables.some((x) => x.table === n) ? ' (has guests: join them)' : ''}</option>
                        ))}
                      </select>
                    </label>
                    <button className="a-btn is-gold">Move</button>
                    <button type="button" className="a-btn" onClick={() => setMoving(null)}>Cancel</button>
                  </form>
                )}
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
              {list.map((o) => <OrderCard key={o.id} order={o} column={column} currency={currency} onStatus={setStatus} can={can} others={(liveAt.get(o.table) || 1) - 1} setError={setError} />)}
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
