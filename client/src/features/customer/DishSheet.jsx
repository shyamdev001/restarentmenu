import { useEffect, useState } from 'react';
import Sheet, { Stepper } from './Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { HEAT_LABELS, SPICE_LEVELS, money, unitPrice } from '../../lib/format.js';

/** Full dish profile plus the choices a guest can make before adding it. */
export default function DishSheet({ open, onClose, dish, option, onOption, currency, onAdd }) {
  const [qty, setQty] = useState(1);
  useEffect(() => { if (open) setQty(1); }, [open, dish.id]);

  const set = (patch) => onOption({ ...option, ...patch });
  const toggleAddon = (name) => set({ addons: { ...option.addons, [name]: !option.addons[name] } });

  return (
    <Sheet open={open} onClose={onClose} tall
      eyebrow={`${dish.veg ? 'Vegetarian' : 'Non-vegetarian'} · ${dish.prepMin} min`}
      title={dish.name} accent={dish.accent}>
      <div className="c-body c-rail">
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--soft)' }}>{dish.description}</p>

        <div className="c-facts">
          <div className="c-fact"><b>{dish.kcal || '–'}</b><small>kcal</small></div>
          <div className="c-fact"><b>{dish.protein ? dish.protein + 'g' : '–'}</b><small>protein</small></div>
          <div className="c-fact"><b>{dish.prepMin}</b><small>minutes</small></div>
          <div className="c-fact">
            <b>{[1, 2, 3].map((n) => <span key={n} className={'c-heat' + (n <= dish.spice ? ' is-on' : '')} />)}</b>
            <small>{HEAT_LABELS[dish.spice]}</small>
          </div>
        </div>

        {dish.ingredients.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>What's in it</h3>
            <div className="c-chips">{dish.ingredients.map((i) => <span key={i} className="c-chip">{i}</span>)}</div>
            {dish.allergens && (
              <p className="c-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                <span className="c-eyebrow c-gold">Allergens&nbsp;&nbsp;</span>{dish.allergens}
              </p>
            )}
          </div>
        )}

        {dish.chefNote && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="c-eyebrow c-gold">From the chef</div>
            <p className="c-quote">“{dish.chefNote}”</p>
          </div>
        )}

        {dish.spice > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3>Spice level</h3>
            <div className="c-pills">
              {SPICE_LEVELS.map((level) => (
                <button key={level} className={'c-pill c-press' + (option.spice === level ? ' is-on' : '')}
                  aria-pressed={option.spice === level} onClick={() => set({ spice: level })}>{level}</button>
              ))}
            </div>
          </div>
        )}

        {dish.addons.length > 0 && (
          <div>
            <h3 style={{ marginBottom: 6 }}>Goes well with</h3>
            {dish.addons.map((a) => {
              const on = !!option.addons[a.name];
              return (
                <button key={a.name} className={'c-option' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => toggleAddon(a.name)}>
                  <span><i className="c-tick">{on && <Icon name="check" size={14} strokeWidth={3} />}</i>{a.name}</span>
                  <span className="c-muted">+ {money(a.price, currency)}</span>
                </button>
              );
            })}
          </div>
        )}

        <label className="c-field">
          <Icon name="pen" size={17} />
          <input type="text" maxLength={140} placeholder="A note for the kitchen (optional)" aria-label="Note for the kitchen"
            value={option.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>

      <div className="c-foot">
        <Stepper big value={qty} min={1} onChange={setQty} />
        <button className="c-cta c-press" disabled={!dish.available} onClick={() => onAdd(qty)}>
          <span>{dish.available ? 'Add' : 'Sold out'}</span>
          <span>{money(unitPrice(dish, option) * qty, currency)}</span>
        </button>
      </div>
    </Sheet>
  );
}
