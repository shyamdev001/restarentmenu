import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { SPICE_LEVELS, fullName, money, tableName, thumb } from '../../lib/format.js';

/**
 * Staff enter an order themselves: for a guest who will not scan, a phone
 * order, or a takeaway at the counter. It reaches the kitchen exactly like an
 * order from a guest's phone.
 */
export default function NewOrder({ menu, settings, onClose, onSent, onSending }) {
  const [table, setTable] = useState(0);            // 0 = the counter
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState({});           // { dishId: { qty, spice, addons: { name: true } } }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currency = settings.currency;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => menu.categories
    .map((c) => ({ ...c, items: menu.dishes.filter((d) => d.category === c.id && (!q || fullName(d).toLowerCase().includes(q))) }))
    .filter((g) => g.items.length), [menu, q]);

  const setQty = (dish, qty) => setLines((all) => {
    const next = { ...all };
    if (qty <= 0) delete next[dish.id];
    else next[dish.id] = { spice: dish.spice > 0 ? 'Medium' : '', addons: {}, ...all[dish.id], qty: Math.min(20, qty) };
    return next;
  });
  const patch = (dish, change) => setLines((all) => ({ ...all, [dish.id]: { ...all[dish.id], ...change } }));

  const chosen = menu.dishes.filter((d) => lines[d.id]);
  const unit = (d) => d.price + d.addons.filter((a) => lines[d.id].addons[a.name]).reduce((n, a) => n + a.price, 0);
  const subtotal = chosen.reduce((n, d) => n + unit(d) * lines[d.id].qty, 0);
  const tax = Math.round(subtotal * settings.taxPercent) / 100;
  const plates = chosen.reduce((n, d) => n + lines[d.id].qty, 0);

  const send = async () => {
    setBusy(true); setError('');
    onSending?.(); // this screen entered it, so it does not need the order called out back to it
    try {
      const order = await api.post('/admin/orders', {
        table,
        items: chosen.map((d) => ({
          dishId: d.id, qty: lines[d.id].qty,
          spice: d.spice > 0 ? lines[d.id].spice : '',
          addons: d.addons.filter((a) => lines[d.id].addons[a.name]).map((a) => a.name)
        }))
      });
      onSent(order);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="a-modal" data-lenis-prevent role="dialog" aria-modal="true" aria-label="New order">
      <div className="a-modal__box a-neworder">
        <div className="a-title">
          <h1>New <em>order</em></h1>
          <button type="button" className="a-btn is-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="a-neworder__top">
          <label className="a-label">Where is it for?
            <select value={table} onChange={(e) => setTable(Number(e.target.value))}>
              <option value={0}>Counter (takeaway or walk-in)</option>
              {Array.from({ length: settings.tables }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Table {n}</option>)}
            </select>
          </label>
          <label className="a-label">Find a dish
            <input type="search" placeholder="Type a name" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
        </div>

        <div className="a-neworder__list">
          {groups.map((g) => (
            <section key={g.id}>
              <h2 className="a-neworder__group">{g.name}</h2>
              {g.items.map((d) => {
                const line = lines[d.id];
                return (
                  <div key={d.id} className={'a-pick' + (line ? ' is-in' : '') + (d.available ? '' : ' is-off')}>
                    <div className="a-pick__row">
                      {d.image ? <img src={thumb(d.image)} alt="" loading="lazy" decoding="async" /> : <span className="a-thumb" />}
                      <span className="a-pick__name"><b>{fullName(d)}</b><small>{d.available ? money(d.price, currency) : 'Sold out today'}</small></span>
                      {line ? (
                        <span className="a-qty">
                          <button type="button" onClick={() => setQty(d, line.qty - 1)} aria-label={`One less ${fullName(d)}`}>−</button>
                          <b>{line.qty}</b>
                          <button type="button" onClick={() => setQty(d, line.qty + 1)} aria-label={`One more ${fullName(d)}`}>+</button>
                        </span>
                      ) : (
                        <button type="button" className="a-btn" disabled={!d.available} onClick={() => setQty(d, 1)}>Add</button>
                      )}
                    </div>
                    {line && (d.spice > 0 || d.addons.length > 0) && (
                      <div className="a-pick__opts">
                        {d.spice > 0 && SPICE_LEVELS.map((level) => (
                          <button key={level} type="button" className={'a-opt' + (line.spice === level ? ' is-on' : '')} aria-pressed={line.spice === level} onClick={() => patch(d, { spice: level })}>{level}</button>
                        ))}
                        {d.addons.map((a) => {
                          const on = !!line.addons[a.name];
                          return <button key={a.name} type="button" className={'a-opt' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => patch(d, { addons: { ...line.addons, [a.name]: !on } })}>+ {a.name} · {money(a.price, currency)}</button>;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
          {!groups.length && <p className="a-muted">No dish matches that name.</p>}
        </div>

        {error && <p className="a-error" role="alert">{error}</p>}
        <div className="a-neworder__foot">
          <span>
            <b>{plates ? money(subtotal + tax, currency) : 'Nothing chosen yet'}</b>
            {plates > 0 && <small>{plates} {plates === 1 ? 'plate' : 'plates'} · {tableName(table)} · incl. {money(tax, currency)} tax</small>}
          </span>
          <button type="button" className="a-btn is-gold" disabled={!plates || busy} onClick={send}>{busy ? 'Sending…' : 'Send to the kitchen'}</button>
        </div>
      </div>
    </div>
  );
}
