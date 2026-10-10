import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';

/** One QR code per table. Each opens the menu already set to that table, with the code that proves it. */
export default function TablesQr({ settings }) {
  const base = (settings.publicUrl || window.location.origin).replace(/\/+$/, '');
  const tables = Array.from({ length: settings.tables }, (_, i) => i + 1);
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  const [codes, setCodes] = useState({});

  useEffect(() => { api.get('/admin/table-codes').then((r) => setCodes(r.codes)).catch(() => {}); }, [settings.tables]);
  const link = (n) => `${base}/?table=${n}` + (codes[n] ? `&k=${codes[n]}` : '');

  return (
    <>
      <div className="a-title a-noprint">
        <h1>Tables <em>&amp; QR codes</em></h1>
        <button className="a-btn is-gold" onClick={() => window.print()}><Icon name="print" size={16} />Print all</button>
      </div>
      {isLocal && (
        <p className="a-error a-noprint">
          These codes point to {base}, which only works on this computer. Before printing, set the public address
          of your site under Settings.
        </p>
      )}
      <p className="a-muted a-small a-noprint">
        Change the number of tables under Settings. Print this page, cut the cards and place one on each table.
        {settings.requireQr
          ? ' Each card carries its own code, and orders are only accepted from a scan of that table\'s card.'
          : ' Any link to the menu can order right now. To accept orders only from these cards, turn on "Only take orders from a scanned table QR code" under Settings.'}
      </p>
      <div className="a-qrs">
        {tables.map((n) => (
          <div key={n} className="a-qr">
            <img src={`/api/admin/qr/${n}?v=${encodeURIComponent(base)}`} alt={`QR code for table ${n}`} loading="lazy" />
            <b>Table {n}</b>
            <span style={{ fontSize: 12 }}>Scan to see the menu and order</span>
            <small><a className="a-noprint" href={link(n)} target="_blank" rel="noreferrer">Open this table's menu</a></small>
          </div>
        ))}
      </div>
    </>
  );
}
