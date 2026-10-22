import { useEffect, useState } from 'react';
import Sheet from './Sheet.jsx';
import { money } from '../../lib/format.js';

/** Itemised bill for everything this table has sent to the kitchen. Payment happens with the server. */
export default function BillSheet({ open, onClose, orders, tableOrders, table, currency, onAsk, onNewVisit }) {
  // The whole table's bill when the server can give it, otherwise what this phone ordered.
  const shared = Array.isArray(tableOrders);
  const billed = (shared ? tableOrders : orders).filter((o) => o.status !== 'cancelled');
  const subtotal = billed.reduce((sum, o) => sum + o.subtotal, 0);
  const tax = billed.reduce((sum, o) => sum + o.tax, 0);
  const taxPercent = billed[0]?.taxPercent ?? 0;
  const allServed = billed.length > 0 && billed.every((o) => o.status === 'served');
  // Several phones at one table: show what came from this one apart from the rest, each with its own total.
  const ownNumbers = new Set(orders.map((o) => o.number));
  const mine = billed.filter((o) => ownNumbers.has(o.number));
  const rest = billed.filter((o) => !ownNumbers.has(o.number));
  const split = shared && mine.length > 0 && rest.length > 0;
  const groups = split ? [['From this phone', mine], ['Others at your table', rest]] : [['', billed]];
  // One request is enough: stop a second tap from paging the server again.
  const [asked, setAsked] = useState(false);
  useEffect(() => { setAsked(false); }, [billed.length]);

  return (
    <Sheet open={open} onClose={onClose} title="The" accent="bill" tall>
      <div className="c-body c-rail" style={{ gap: 0 }}>
        {groups.map(([title, list]) => (
          <section key={title || 'all'} className={split ? 'c-billgroup' : undefined}>
            {title && (
              <div className="c-billgroup__head" role="heading" aria-level={3}><span>{title}</span><span>{money(list.reduce((n, o) => n + o.total, 0), currency)}</span></div>
            )}
            {list.flatMap((o) => o.items.map((item, i) => (
              <div key={o.number + '-' + i} className="c-billrow">
                <span><b className="c-gold">{item.qty} ×</b>&nbsp; {item.name}</span>
                <b>{money(item.lineTotal, currency)}</b>
              </div>
            )))}
          </section>
        ))}
        {!billed.length && <p className="c-empty">Nothing has been sent<br />to the kitchen yet.</p>}
      </div>

      {billed.length > 0 && (
        <>
          <div className="c-sum">
            <div><span>Subtotal</span><span>{money(subtotal, currency)}</span></div>
            <div><span>Tax ({taxPercent}%)</span><span>{money(tax, currency)}</span></div>
          </div>
          <div className="c-total">
            <span className="c-eyebrow c-muted">{split ? 'Table total' : 'Total'}</span>
            <b>{money(subtotal + tax, currency)}</b>
          </div>
          <p className="c-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {split ? 'The total is for the whole table. To pay separately, tell your server who had what. ' : shared && table ? `Everything ordered at table ${table}, from every phone. ` : ''}Your server will bring the bill and take payment at the table.
          </p>
        </>
      )}
      <button className="c-cta is-gold c-press" disabled={!billed.length || asked} onClick={() => { setAsked(true); onAsk(); }}>{asked ? 'Bill requested' : 'Ask for the bill'}</button>
      {allServed && !shared && <button className="c-ghost c-press" onClick={onNewVisit}>Start a new visit</button>}
    </Sheet>
  );
}
