import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';
import { money, timeAgo } from '../../lib/format.js';

const FILTERS = [
  ['all', 'Everyone'],
  ['lapsed', 'Not seen lately'],
  ['birthday', 'Birthdays this month'],
  ['top', 'Top spenders'],
  ['reward', 'Reward waiting'],
  ['dish', 'Ordered a dish']
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** +91 98765 43210 */
const phoneLabel = (digits) => (/^91\d{10}$/.test(digits) ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : '+' + digits);
const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
const personal = (text, g) => text.replaceAll('{name}', firstName(g.name));
const waLink = (g, text) => `https://wa.me/${g.phone}${text ? '?text=' + encodeURIComponent(text) : ''}`;

/**
 * The guest club, for the owner: everyone who joined, ready-made groups to
 * reach (not seen lately, birthdays, top spenders, a reward waiting, fans of a
 * dish), and an offer to send: as a notification to those who allowed it, on
 * WhatsApp one tap at a time, or as a list to download.
 */
export default function GuestsPage({ settings, can, setError }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dish, setDish] = useState('');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [offer, setOffer] = useState({ title: '', body: '' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [queue, setQueue] = useState(null);       // WhatsApp, one by one: { list, done: Set }
  const [confirm, dialog] = useConfirm();
  const currency = settings.currency;
  const club = settings.club || {};

  const params = useMemo(() => {
    const p = new URLSearchParams({ filter });
    if (query.trim()) p.set('q', query.trim());
    if (filter === 'dish' && dish.trim()) p.set('dish', dish.trim());
    return p.toString();
  }, [filter, query, dish]);

  const load = useCallback(() => api.get('/admin/guests?' + params).then((d) => { setData(d); setPicked(new Set()); }).catch((e) => setError(e.message)), [params, setError]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const guests = data?.guests || [];
  const chosen = guests.filter((g) => picked.has(g.id));
  const target = chosen.length ? chosen : guests;               // nothing ticked: the whole group shown
  const reachable = target.filter((g) => g.offers).length;
  const toggle = (id) => setPicked((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const notifyAll = async () => {
    if (!offer.title.trim() || !offer.body.trim()) { setResult('Write a title and the offer first.'); return; }
    setSending(true); setResult('');
    try {
      const r = await api.post('/admin/guests/offer', { ids: target.map((g) => g.id), title: offer.title, body: offer.body });
      setResult(`Sent to ${r.sent} ${r.sent === 1 ? 'phone' : 'phones'}.${r.unreachable ? ` ${r.unreachable} cannot get notifications: use WhatsApp for them.` : ''}`);
    } catch (e) { setResult(e.message); } finally { setSending(false); }
  };

  const redeem = async (g) => {
    if (!(await confirm({ title: `Give ${firstName(g.name)} their reward?`, body: `${club.reward || 'The reward'}. It comes off their card.`, action: 'Reward given', cancel: 'Not yet' }))) return;
    api.post(`/admin/guests/${g.id}/redeem`).then(load).catch((e) => setError(e.message));
  };
  const remove = async (g) => {
    if (!(await confirm({ title: `Delete ${g.name}?`, body: 'Their name, number and card are deleted for good. Do this when a guest asks to be removed.', action: 'Delete', cancel: 'Keep' }))) return;
    api.del(`/admin/guests/${g.id}`).then(load).catch((e) => setError(e.message));
  };

  const s = data?.summary;
  return (
    <>
      {dialog}
      <div className="a-title">
        <h1>Your <em>guests</em></h1>
        <a className="a-btn" href={'/api/admin/guests/export?' + params} download><Icon name="down" size={16} />Download list</a>
      </div>
      <p className="a-muted a-lede">Guests who joined your club from their phone. They ticked the box themselves, and leaving deletes them.</p>

      {s && (
        <div className="a-stats a-gueststats">
          <div className="a-stat"><b>{s.total}</b><span>Members</span></div>
          <div className="a-stat"><b>{s.reachable}</b><span>Get notifications</span></div>
          <div className="a-stat"><b>{s.lapsed}</b><span>Not seen in {s.lapseDays} days</span></div>
          <div className="a-stat"><b>{s.birthdays}</b><span>Birthdays this month</span></div>
          <div className="a-stat"><b>{s.rewards}</b><span>Rewards waiting</span></div>
        </div>
      )}

      <section className="a-card a-guestfind">
        <div className="a-guestfilters" role="group" aria-label="Which guests">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={'a-opt' + (filter === id ? ' is-on' : '')} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="a-guestsearch">
          {filter === 'dish' && <input className="a-input" placeholder="Which dish? e.g. biryani" value={dish} onChange={(e) => setDish(e.target.value)} aria-label="Dish" />}
          <input className="a-input" type="search" placeholder="Search a name or number" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search guests" />
        </div>
      </section>

      {s && s.total === 0 && (
        <div className="a-empty">
          Nobody has joined yet. Guests see the club on their phone while they wait for food and on the bill
          {club.on === false ? '; it is switched off under Settings → Guest club.' : '.'}
        </div>
      )}

      {guests.length > 0 && (
        <section className="a-card" aria-label="Guests">
          <div className="a-guesthead">
            <label className="a-check"><input type="checkbox" checked={chosen.length === guests.length} onChange={(e) => setPicked(e.target.checked ? new Set(guests.map((g) => g.id)) : new Set())} />
              <span>{chosen.length ? `${chosen.length} chosen` : `${guests.length} ${guests.length === 1 ? 'guest' : 'guests'}`}</span></label>
          </div>
          <ul className="a-guests">
            {guests.map((g) => (
              <li key={g.id} className={'a-guest' + (picked.has(g.id) ? ' is-picked' : '')}>
                <input type="checkbox" checked={picked.has(g.id)} onChange={() => toggle(g.id)} aria-label={`Choose ${g.name}`} />
                <span className="a-person__badge" aria-hidden="true">{g.name.slice(0, 1).toUpperCase()}</span>
                <span className="a-guest__who">
                  <b>{g.name}{g.rewardsReady > 0 && <em className="a-tag">Reward waiting</em>}</b>
                  <small>{phoneLabel(g.phone)}{g.birthday ? ` · birthday ${g.birthday.day} ${MONTHS[g.birthday.month - 1]}` : ''}{g.offers ? ' · gets notifications' : ''}</small>
                </span>
                <span className="a-guest__facts">
                  <span><b>{g.visits}</b> {g.visits === 1 ? 'visit' : 'visits'}</span>
                  <span><b>{money(g.spent, currency)}</b> spent</span>
                  {club.loyalty !== false && <span><b>{g.stamps}/{club.stamps || 5}</b> stamps</span>}
                  <span>{g.lastVisitAt ? `last ${timeAgo(g.lastVisitAt)}` : 'no paid visit yet'}</span>
                  {g.favourite && <span>loves {g.favourite}</span>}
                </span>
                <span className="a-guest__tools">
                  <a className="a-btn" href={waLink(g, offer.body ? personal(offer.body, g) : '')} target="_blank" rel="noopener noreferrer"><Icon name="chat" size={15} />WhatsApp</a>
                  {g.rewardsReady > 0 && can('settle') && <button className="a-btn is-gold" onClick={() => redeem(g)}><Icon name="star" size={15} />Give reward</button>}
                  <button className="a-btn is-icon is-danger" aria-label={`Delete ${g.name}`} onClick={() => remove(g)}><Icon name="trash" size={15} /></button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {guests.length > 0 && (
        <section className="a-card a-offer" aria-label="Send an offer">
          <h2 className="a-sub">Send an offer <span className="a-muted a-small">to {chosen.length ? `the ${target.length} chosen` : `all ${target.length} shown`}</span></h2>
          <label className="a-label">Title<input maxLength={60} placeholder="This weekend only" value={offer.title} onChange={(e) => setOffer({ ...offer, title: e.target.value })} /></label>
          <label className="a-label">Message <span className="a-hint">{'{name}'} becomes each guest's first name</span>
            <textarea maxLength={200} placeholder="Hi {name}, 20% off your bill this Saturday and Sunday. Show this message." value={offer.body} onChange={(e) => setOffer({ ...offer, body: e.target.value })} />
          </label>
          <div className="a-offer__send">
            <button className="a-btn is-gold" disabled={sending || !reachable} onClick={notifyAll}>
              <Icon name="bell" size={16} />{sending ? 'Sending…' : `Send as notification (${reachable} of ${target.length} can get it)`}
            </button>
            <button className="a-btn" disabled={!offer.body.trim()} onClick={() => setQueue({ list: target, done: new Set() })}>
              <Icon name="chat" size={16} />WhatsApp, one tap each
            </button>
          </div>
          {result && <p className="a-flash" role="status"><Icon name="check" size={16} /><span>{result}</span></p>}
          <p className="a-hint">Notifications are free and arrive straight away, but only on phones that allowed them (not iPhones). WhatsApp opens with the message written for each guest; you press send. For a long list, download it and use a broadcast list in the WhatsApp Business app.</p>
        </section>
      )}

      {queue && (
        <section className="a-card a-waqueue" aria-label="WhatsApp, one by one">
          <h2 className="a-sub">WhatsApp, one by one <span className="a-muted a-small">{queue.done.size} of {queue.list.length} opened</span>
            <button className="a-btn" style={{ marginLeft: 'auto' }} onClick={() => setQueue(null)}>Done</button>
          </h2>
          <ul>
            {queue.list.map((g) => (
              <li key={g.id} className={queue.done.has(g.id) ? 'is-done' : ''}>
                <span><b>{g.name}</b><small>{phoneLabel(g.phone)}</small></span>
                <a className={'a-btn' + (queue.done.has(g.id) ? '' : ' is-gold')} href={waLink(g, personal(offer.body, g))} target="_blank" rel="noopener noreferrer"
                  onClick={() => setQueue((q) => ({ ...q, done: new Set(q.done).add(g.id) }))}>
                  {queue.done.has(g.id) ? <><Icon name="check" size={15} />Opened</> : <><Icon name="send" size={15} />Open WhatsApp</>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
