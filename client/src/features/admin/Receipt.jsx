import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { tableName } from '../../lib/format.js';

const two = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** The same dish with the same extras, ordered at different times, is one line on the bill. */
function lines(orders) {
  const map = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const extras = [i.spice, ...(i.addons || []).map((a) => '+' + a.name)].filter(Boolean).join(', ');
      const key = `${i.name}|${extras}|${i.unitPrice}`;
      const line = map.get(key) || { name: i.name, extras, rate: i.unitPrice, qty: 0, amount: 0 };
      line.qty += i.qty;
      line.amount += i.lineTotal;
      map.set(key, line);
    }
  }
  return [...map.values()];
}

/** Tax by rate: an order placed before a tax change keeps the rate it was charged. */
function taxes(orders) {
  const map = new Map();
  for (const o of orders) map.set(o.taxPercent, (map.get(o.taxPercent) || 0) + o.tax);
  return [...map.entries()].filter(([, amount]) => amount > 0);
}

function Bill({ settings, table, orders, printedAt }) {
  const subtotal = orders.reduce((n, o) => n + o.subtotal, 0);
  const total = orders.reduce((n, o) => n + o.total, 0);
  const gst = !!settings.gstin;
  return (
    <article className="a-receipt">
      <header>
        <b className="a-receipt__name">{settings.name}</b>
        {settings.address && <span>{settings.address}</span>}
        {settings.phone && <span>Tel {settings.phone}</span>}
        {gst && <span>GSTIN {settings.gstin}</span>}
        <b className="a-receipt__kind">{gst ? 'TAX INVOICE' : 'BILL'}</b>
      </header>
      <div className="a-receipt__meta">
        <span>{tableName(table)}</span>
        <span>Order {orders.map((o) => '#' + o.number).join(', ')}</span>
        <span>{printedAt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })} {printedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          {lines(orders).map((l, i) => (
            <tr key={i}>
              <td>{l.name}{l.extras && <small>{l.extras}</small>}<small>@ {two(l.rate)}</small></td>
              <td>{l.qty}</td>
              <td>{two(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl>
        <div><dt>Subtotal</dt><dd>{two(subtotal)}</dd></div>
        {taxes(orders).map(([rate, amount]) => (gst
          ? [
            <div key={rate + 'c'}><dt>CGST {rate / 2}%</dt><dd>{two(amount / 2)}</dd></div>,
            <div key={rate + 's'}><dt>SGST {rate / 2}%</dt><dd>{two(amount / 2)}</dd></div>
          ]
          : <div key={rate}><dt>Tax {rate}%</dt><dd>{two(amount)}</dd></div>))}
        <div className="a-receipt__total"><dt>Total ({settings.currency})</dt><dd>{two(total)}</dd></div>
      </dl>
      <footer>{settings.billNote || 'Thank you. Please visit again.'}</footer>
    </article>
  );
}

/**
 * The printed bill for a table: everything not yet paid, with the restaurant's
 * address and GSTIN, and the tax split into CGST and SGST when a GSTIN is set.
 * Takeaways at the counter each get a bill of their own. Prints on an 80 mm
 * receipt printer or on A4.
 */
export default function Receipt({ table, settings, onClose }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [printedAt] = useState(() => new Date());

  useEffect(() => {
    api.get(`/admin/tables/${table}/bill`).then(setOrders).catch((e) => setError(e.message));
  }, [table]);

  useEffect(() => {
    const done = () => document.body.classList.remove('is-printing-bill');
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('afterprint', done);
    document.addEventListener('keydown', onKey);
    return () => { done(); window.removeEventListener('afterprint', done); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const print = () => { document.body.classList.add('is-printing-bill'); window.print(); };
  const bills = orders ? (table === 0 ? orders.map((o) => [o]) : [orders]) : [];

  return createPortal(
    <div className="a-receiptwrap" role="dialog" aria-modal="true" aria-label={`Bill for ${tableName(table)}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="a-receiptbox">
        <div className="a-receiptbox__bar">
          <b>Bill · {tableName(table)}</b>
          <button className="a-btn is-icon" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
        </div>
        {error && <p className="a-error" role="alert">{error}</p>}
        {!orders && !error && <p className="a-muted a-small">Loading…</p>}
        {orders && !orders.length && <p className="a-muted a-small">Nothing unpaid at this table.</p>}
        <div className="a-receiptbox__paper">
          {bills.map((group) => <Bill key={group[0].id} settings={settings} table={table} orders={group} printedAt={printedAt} />)}
        </div>
        {!settings.gstin && <p className="a-hint">Add your address and GSTIN under Settings to print them on the bill.</p>}
        <button className="a-btn is-gold" disabled={!bills.length} onClick={print}><Icon name="print" size={16} />Print</button>
      </div>
    </div>,
    document.body
  );
}
