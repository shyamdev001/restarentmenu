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
  // One request is enough: stop a second tap from paging the server again.
  const [asked, setAsked] = useState(false);
  useEffect(() => { setAsked(false); }, [billed.length]);

  return (
    <Sheet open={open} onClose={onClose} title="The" accent="bill" tall>
      <div className="c-body c-rail" style={{ gap: 0 }}>
        {billed.flatMap((o) => o.items.map((item, i) => (
          <div key={o.number + '-' + i} className="c-billrow">
            <span><b className="c-gold">{item.qty} ×</b>&nbsp; {item.name}</span>
            <b>{money(item.lineTotal, currency)}</b>
          </div>
        )))}
        {!billed.length && <p className="c-empty">Nothing has been sent<br />to the kitchen yet.</p>}
      </div>

      {billed.length > 0 && (
        <>
          <div className="c-sum">
            <div><span>Subtotal</span><span>{money(subtotal, currency)}</span></div>
            <div><span>Tax ({taxPercent}%)</span><span>{money(tax, currency)}</span></div>
          </div>
          <div className="c-total">
            <span className="c-eyebrow c-muted">Total</span>
            <b>{money(subtotal + tax, currency)}</b>
          </div>
          <p className="c-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {shared && table ? `Everything ordered at table ${table}, from every phone. ` : ''}Your server will bring the bill and take payment at the table.
          </p>
        </>
      )}
      <button className="c-cta is-gold c-press" disabled={!billed.length || asked} onClick={() => { setAsked(true); onAsk(); }}>{asked ? 'Bill requested' : 'Ask for the bill'}</button>
      {allServed && !shared && <button className="c-ghost c-press" onClick={onNewVisit}>Start a new visit</button>}
    </Sheet>
  );
}
