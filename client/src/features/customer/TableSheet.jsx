import Sheet from './Sheet.jsx';

/** Asked only when the guest arrived without a table in the link (no QR scan), before anything is sent. */
export default function TableSheet({ open, onClose, tables, current, onPick }) {
  const numbers = Array.from({ length: tables }, (_, i) => i + 1);
  return (
    <Sheet open={open} onClose={onClose} title="Your" accent="table" tall={tables > 15}>
      <p className="c-muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
        Tap the number on your table so the kitchen knows where to bring your order.
      </p>
      <div className="c-body c-rail">
        <div className="c-tables">
          {numbers.map((n) => (
            <button key={n} className={'c-pill c-press' + (n === current ? ' is-on' : '')} aria-pressed={n === current}
              aria-label={`Table ${n}`} onClick={() => onPick(n)}>{n}</button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
