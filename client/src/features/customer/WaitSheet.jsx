import { useEffect, useMemo, useRef, useState } from 'react';
import Sheet from './Sheet.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../lib/api.js';
import StageArt from './StageArt.jsx';
import { HEAT_LABELS, fullName, money, pad2, thumb } from '../../lib/format.js';

const STEPS = ['new', 'cooking', 'ready', 'served'];
const STATUS = {
  new: 'With the kitchen',
  cooking: 'On the fire',
  ready: 'On its way to you',
  served: 'On your table. Enjoy.'
};

/** Minutes left, and how far round the ring to draw, from when the order went in and how long it should take. */
function useCountdown(order) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  if (!order) return { minutes: 0, progress: 0 };
  if (order.status === 'served') return { minutes: 0, progress: 1 };
  const total = Math.max(1, order.etaMin || 15) * 60000;
  const gone = now - new Date(order.createdAt).getTime();
  // The ring never quite closes until the kitchen says so, and an order running late does not show "0 min".
  const progress = order.status === 'ready' ? 0.96 : Math.min(0.9, Math.max(0.04, gone / total));
  return { minutes: Math.max(1, Math.ceil((total - gone) / 60000)), progress, late: gone > total };
}

/** The wheel: the owner's prizes round a disc. The server chooses where it stops; this only turns it there. */
function Wheel({ prizes, order, onSpun }) {
  const [turn, setTurn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const landed = useRef(null);
  const seg = 360 / prizes.length;

  const spin = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.post(`/orders/${order.id}/spin`);
      landed.current = result.order;
      // Several full turns, then stop with the chosen segment under the pointer, a little off-centre so it feels real.
      setTurn((t) => Math.ceil(t / 360) * 360 + 360 * 5 - result.index * seg + (Math.random() - 0.5) * seg * 0.5);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const point = (deg, r) => { const a = (deg * Math.PI) / 180; return `${50 + r * Math.sin(a)} ${50 - r * Math.cos(a)}`; };

  return (
    <div className="c-wheel">
      <div className="c-wheel__stage">
        <i className="c-wheel__pin" aria-hidden="true" />
        <svg viewBox="0 0 100 100" className="c-wheel__disc" style={{ transform: `rotate(${turn}deg)` }} aria-hidden="true"
          onTransitionEnd={() => { if (landed.current) { onSpun(landed.current); landed.current = null; } }}>
          {prizes.map((p, i) => (
            <g key={i}>
              <path className={p.win ? 'is-win' : i % 2 ? 'is-b' : 'is-a'}
                d={`M50 50 L${point(i * seg - seg / 2, 48)} A48 48 0 0 1 ${point(i * seg + seg / 2, 48)} Z`} />
              <text x="62" y="50" dominantBaseline="middle" transform={`rotate(${i * seg - 90} 50 50)`}>{p.label.length > 17 ? p.label.slice(0, 16) + '…' : p.label}</text>
            </g>
          ))}
          <circle cx="50" cy="50" r="48" className="c-wheel__rim" />
          <circle cx="50" cy="50" r="7" className="c-wheel__hub" />
        </svg>
      </div>
      {error && <p className="c-wheel__error" role="alert">{error}</p>}
      <button className="c-cta is-gold c-press" disabled={busy} onClick={spin}>{busy ? 'Good luck…' : 'Spin the wheel'}</button>
      <p className="c-muted c-wait__small">One spin for your table this visit.</p>
    </div>
  );
}

/** Stars and an optional line, once the meal is on the table. */
function Rate({ order, onRated }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true); setError('');
    try { onRated(await api.post(`/orders/${order.id}/rating`, { stars, comment })); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <section className="c-wait__block">
      <h3>How was it?</h3>
      <div className="c-stars" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            className={'c-star c-press' + (n <= stars ? ' is-on' : '')} onClick={() => setStars(n)}>
            <Icon name="star" size={30} fill={n <= stars ? 'currentColor' : 'none'} strokeWidth={1.4} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <label className="c-field">
            <input type="text" maxLength={300} placeholder="Anything to tell the chef? (optional)" aria-label="Your comment"
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {error && <p className="c-wheel__error" role="alert">{error}</p>}
          <button className="c-cta is-gold c-press" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send to the chef'}</button>
        </>
      )}
    </section>
  );
}

/**
 * While you wait. After an order is sent this is where the guest lands: the
 * order's progress with a countdown, something quick to add, the story of the
 * dish that is coming, the owner's wheel, and a rating once it is served.
 */
export default function WaitSheet({
  open, onClose, orders, dishes, settings, table,
  cart, cartCount, cartTotal, onAdd, onSend, sending, onBasket, onOrder
}) {
  const currency = settings.currency;
  const live = orders.filter((o) => STEPS.slice(0, 3).includes(o.status));
  const focus = live.at(-1) || orders.filter((o) => o.status === 'served').at(-1) || orders.at(-1);
  const { minutes, progress, late } = useCountdown(focus);
  const [about, setAbout] = useState(0);

  // The dishes in this order, as the menu knows them (for the photo, the chef's note, what is in it).
  const ordered = useMemo(() => {
    const names = [...new Set((focus?.items || []).map((i) => i.name))];
    return names.map((name) => dishes.find((d) => fullName(d) === name)).filter(Boolean);
  }, [focus, dishes]);
  const lead = ordered[0];
  const told = ordered[Math.min(about, ordered.length - 1)];

  // Quick things from the kitchen the table has not had yet.
  const had = new Set(orders.flatMap((o) => o.items.map((i) => i.name)));
  const quick = dishes.filter((d) => d.available && !had.has(fullName(d)))
    .sort((a, b) => a.prepMin - b.prepMin || a.price - b.price).slice(0, 3);

  const game = settings.game;
  const spun = orders.find((o) => o.prize);
  const tableSpun = orders.some((o) => o.spun);

  if (!focus) {
    return (
      <Sheet open={open} onClose={onClose} title="Your" accent="order" tall>
        <p className="c-empty">Nothing is with the kitchen yet.<br />Add a plate to begin.</p>
      </Sheet>
    );
  }

  const cancelled = focus.status === 'cancelled';
  const at = STEPS.indexOf(focus.status);
  const waiting = at >= 0 && at < 3;

  return (
    <Sheet open={open} onClose={onClose} title={cancelled ? 'Order' : STATUS[focus.status].split('.')[0]} accent={cancelled ? 'cancelled' : ''}
      eyebrow={`Order #${focus.number}${table ? ` · Table ${pad2(table)}` : ''}`} tall label="Your order's progress">
      <div className="c-body c-rail c-wait">
        <section className={'c-wait__hero is-' + focus.status} aria-live="polite">
          <div className="c-wait__plate">
            <svg viewBox="0 0 100 100" className="c-wait__ring" aria-hidden="true">
              <circle cx="50" cy="50" r="47" />
              <circle cx="50" cy="50" r="47" style={{ strokeDashoffset: 295.3 * (1 - progress) }} />
            </svg>
            <div className="c-plate"><span className="c-plate__dish">{lead?.image && <img src={lead.image} alt="" />}</span></div>
            {focus.status === 'cooking' && [0, 1, 2, 3].map((n) => <i key={n} className="c-wait__ember" style={{ '--n': n }} aria-hidden="true" />)}
            {!cancelled && <span className="c-wait__badge" key={focus.status}><StageArt stage={focus.status} size={46} /></span>}
          </div>

          {cancelled ? (
            <p className="c-wait__time">Please ask your server what happened.</p>
          ) : (
            <p className="c-wait__time">
              {focus.status === 'served' ? 'Thank you for ordering with us.'
                : focus.status === 'ready' ? 'Any moment now.'
                  : late ? 'Almost there. Thank you for waiting.'
                    : <>About <b>{minutes} min</b>{focus.ahead > 0 ? ` · ${focus.ahead} ${focus.ahead === 1 ? 'order' : 'orders'} ahead of yours` : focus.status === 'new' ? ' · yours is next' : ''}</>}
            </p>
          )}

          {!cancelled && (
            <ol className="c-wait__steps">
              {['Received', 'Cooking', 'On its way', 'Served'].map((label, i) => (
                <li key={label} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
                  <span className="c-wait__icon"><StageArt stage={STEPS[i]} size={i === at ? 34 : 26} still={i !== at} /></span>{label}
                </li>
              ))}
            </ol>
          )}
        </section>

        {focus.status === 'served' && !focus.stars && <Rate order={focus} onRated={onOrder} />}
        {focus.stars > 0 && <p className="c-wait__thanks">Thank you. Your {focus.stars}-star rating has gone to the chef.</p>}

        {spun?.prize && (
          <section className={'c-wait__block c-prize' + (spun.prize.win ? ' is-win' : '')}>
            <h3>{spun.prize.win ? 'You won' : 'The wheel says'}</h3>
            <p className="c-prize__label">{spun.prize.label}</p>
            <p className="c-muted c-wait__small">{spun.prize.win ? 'Show this to your server. They can see it on your order too.' : 'Thank you for playing. Better luck next visit.'}</p>
          </section>
        )}
        {game?.on && !tableSpun && !cancelled && (
          <section className="c-wait__block">
            <h3>Try your luck</h3>
            <Wheel prizes={game.prizes} order={focus} onSpun={onOrder} />
          </section>
        )}

        {waiting && quick.length > 0 && (
          <section className="c-wait__block">
            <h3>Something while you wait?</h3>
            <p className="c-muted c-wait__small">The quickest plates from the kitchen.</p>
            <div className="c-wait__adds">
              {quick.map((d) => {
                const qty = cart[d.id] || 0;
                return (
                  <div key={d.id} className="c-quick">
                    {d.image && <img src={thumb(d.image)} alt="" loading="lazy" decoding="async" />}
                    <span><b>{fullName(d)}</b><small>{d.prepMin} min · {money(d.price, currency)}</small></span>
                    <button className={'c-quick__add c-press' + (qty ? ' is-in' : '')} onClick={() => onAdd(d)} aria-label={`Add ${fullName(d)}`}>{qty ? `Added · ${qty}` : 'Add'}</button>
                  </div>
                );
              })}
            </div>
            {cartCount > 0 && (
              <button className="c-cta c-press" disabled={sending} onClick={onSend}>
                <span>{sending ? 'Sending…' : `Send ${cartCount} more to the kitchen`}</span><span>{money(cartTotal, currency)}</span>
              </button>
            )}
          </section>
        )}

        {told && (
          <section className="c-wait__block c-wait__story">
            <h3>About your {told.accent || told.name}</h3>
            {ordered.length > 1 && (
              <div className="c-chips">
                {ordered.map((d, i) => <button key={d.id} className={'c-chip c-press' + (d.id === told.id ? ' is-on' : '')} aria-pressed={d.id === told.id} onClick={() => setAbout(i)}>{fullName(d)}</button>)}
              </div>
            )}
            {told.chefNote && <p className="c-quote" key={told.id}>“{told.chefNote}”</p>}
            {told.description && !told.chefNote && <p className="c-quote" key={told.id}>{told.description}</p>}
            {told.ingredients.length > 0 && (
              <ul className="c-wait__made" key={'in' + told.id}>
                {told.ingredients.map((name, i) => <li key={name} style={{ animationDelay: 0.15 + i * 0.12 + 's' }}>{name}</li>)}
              </ul>
            )}
            <p className="c-muted c-wait__small">
              {[HEAT_LABELS[told.spice], told.kcal ? `${told.kcal} kcal` : '', told.protein ? `${told.protein}g protein` : '', told.allergens ? `Contains: ${told.allergens}` : ''].filter(Boolean).join(' · ')}
            </p>
          </section>
        )}
      </div>

      <button className="c-ghost c-press" onClick={onBasket}><Icon name="bag" size={16} />&nbsp; Basket, bill and calling a server</button>
    </Sheet>
  );
}
