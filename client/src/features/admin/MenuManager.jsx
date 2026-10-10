import { useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { fullName, money, thumb } from '../../lib/format.js';
import DishForm from './DishForm.jsx';

export default function MenuManager({ menu, settings, loadMenu, setError }) {
  const [editing, setEditing] = useState(null); // null | {} (new) | dish
  const { categories, dishes } = menu;

  const toggle = (dish) => api.patch(`/admin/dishes/${dish.id}/availability`, { available: !dish.available })
    .then(loadMenu).catch((e) => setError(e.message));

  return (
    <>
      <div className="a-title">
        <h1>The <em>menu</em></h1>
        <button className="a-btn is-gold" disabled={!categories.length} onClick={() => setEditing({})}><Icon name="plus" size={16} />Add dish</button>
      </div>
      {!categories.length && <div className="a-empty">Create a category first, then add dishes to it.</div>}

      {categories.map((c) => {
        const list = dishes.filter((d) => d.category === c.id);
        return (
          <section key={c.id} className="a-card">
            <h2 className="a-sub" style={{ marginBottom: 6 }}>{c.name}<span className="a-muted a-small">{list.length} dishes</span></h2>
            <div className="a-list">
              {list.map((d) => (
                <div key={d.id} className={'a-dish' + (d.available ? '' : ' is-off')}>
                  {d.image ? <img src={thumb(d.image)} alt="" loading="lazy" decoding="async" /> : <div className="a-thumb" />}
                  <div className="a-dish__text">
                    <b>{fullName(d)}</b>
                    <span>{money(d.price, settings.currency)} · {d.veg ? 'Veg' : 'Non-veg'} · {d.available ? 'Available' : 'Sold out'}</span>
                  </div>
                  <button className="a-switch" role="switch" aria-checked={d.available} aria-label={`${fullName(d)} available`} onClick={() => toggle(d)} />
                  <button className="a-btn" onClick={() => setEditing(d)}>Edit</button>
                </div>
              ))}
              {!list.length && <p className="a-muted a-small" style={{ padding: '10px 0' }}>No dishes in this category yet.</p>}
            </div>
          </section>
        );
      })}

      {editing && (
        <DishForm dish={editing} categories={categories} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadMenu(); }} />
      )}
    </>
  );
}
