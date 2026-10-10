import { useState } from 'react';
import Sheet from './Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { fullName, money, thumb } from '../../lib/format.js';

/** The whole menu as a searchable list. Tapping a row spins the carousel to that plate. */
export default function MenuSheet({ open, onClose, categories, dishes, currency, onPick }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (d) => !q || `${fullName(d)} ${d.description} ${d.ingredients.join(' ')}`.toLowerCase().includes(q);

  const groups = categories
    .map((c) => ({ ...c, items: dishes.filter((d) => d.category === c.id && matches(d)) }))
    .filter((g) => g.items.length);

  return (
    <Sheet open={open} onClose={onClose} title="The" accent="menu" tall>
      <label className="c-field">
        <Icon name="search" />
        <input type="search" placeholder="Search dishes or ingredients" aria-label="Search dishes"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="c-body c-rail" style={{ gap: 0 }}>
        {groups.map((g) => (
          <div key={g.id}>
            <div className="c-group c-eyebrow" style={{ margin: '18px 0 6px' }}>{g.name}</div>
            {g.items.map((d) => (
              <button key={d.id} className={'c-item' + (d.available ? '' : ' is-out')} onClick={() => { setQuery(''); onPick(d); }}>
                {d.image && <img src={thumb(d.image)} alt="" loading="lazy" decoding="async" width="54" height="54" />}
                <div>
                  <b>{fullName(d)}</b>
                  <small>{d.available ? d.description : 'Sold out today'}</small>
                </div>
                <strong>{money(d.price, currency)}</strong>
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <p className="c-empty">No dish matches that search.</p>}
      </div>
    </Sheet>
  );
}
