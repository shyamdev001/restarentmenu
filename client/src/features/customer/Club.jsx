import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../lib/api.js';
import { alertsState, askForAlerts, pushSubscription } from '../../lib/notify.js';

/* ------------------------------------------------------------------ the phone's club key */
const KEY = 'sm.guest';
export const readGuestKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveGuestKey = (key) => { try { if (key) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY); } catch { /* private mode */ } };

/** This browser's push subscription, if notifications are allowed, so offers can reach it. */
const currentSubscription = () => pushSubscription();

/**
 * The club on this phone: the stamp card if the guest joined, else nothing.
 * Kept in step when the table pays (a stamp lands) and when the guest returns to the page.
 */
export function useClub(refreshOn) {
  const [key, setKey] = useState(readGuestKey);
  const [card, setCard] = useState(null);
  useEffect(() => {
    if (!key) { setCard(null); return undefined; }
    const load = () => api.get('/club/card?key=' + key).then(setCard).catch((e) => {
      // Left the club, or removed by the restaurant: this phone forgets the key.
      if (e.status === 404) { saveGuestKey(''); setKey(''); }
    });
    load();
    const onBack = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onBack);
    return () => document.removeEventListener('visibilitychange', onBack);
  }, [key, refreshOn]);
  const joined = (newKey, newCard) => { saveGuestKey(newKey); setKey(newKey); setCard(newCard); };
  const left = () => { saveGuestKey(''); setKey(''); setCard(null); };
  return { key, card, joined, left };
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The stamp card: one circle per stamp, the reward at the end. */
function Stamps({ card }) {
  return (
    <div className="c-stamps" role="img" aria-label={`${card.stamps} of ${card.target} stamps`}>
      {Array.from({ length: card.target }, (_, i) => (
        <span key={i} className={'c-stamp' + (i < card.stamps ? ' is-on' : '') + (i === card.target - 1 ? ' is-prize' : '')} style={{ '--i': i }}>
          {i < card.stamps ? <Icon name="check" size={16} strokeWidth={3} /> : i === card.target - 1 ? <Icon name="star" size={15} /> : i + 1}
        </span>
      ))}
    </div>
  );
}

/**
 * The guest club, on the guest's phone. Not a member: what it offers and a
 * short form; nothing is sent without the box ticked. A member: their stamp
 * card, a reward to show staff, offers by notification, and a way to leave.
 */
export function ClubCard({ club, restaurant, orders, member }) {
  const { key, card, joined, left } = member;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', day: '', month: '', consent: false });
  const [state, setState] = useState({ busy: false, error: '', note: '' });
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!club?.on) return null;

  const join = async (e) => {
    e.preventDefault();
    if (!form.consent) { setState({ busy: false, error: 'Please tick the box to join.', note: '' }); return; }
    setState({ busy: true, error: '', note: '' });
    try {
      const result = await api.post('/club/join', {
        name: form.name.trim(), phone: form.phone, consent: true,
        ...(form.day && form.month ? { birthday: { day: Number(form.day), month: Number(form.month) } } : {}),
        orders: orders.map((o) => o.id),
        ...(await currentSubscription().then((subscription) => (subscription ? { subscription } : {})))
      });
      joined(result.key, result.card);
      setState({ busy: false, error: '', note: result.welcomeBack ? `Welcome back, ${result.card.name}.` : `Welcome, ${result.card.name}.` });
    } catch (err) { setState({ busy: false, error: err.message, note: '' }); }
  };

  const offersHere = async () => {
    const allowed = alertsState() === 'default' ? await askForAlerts() : alertsState();
    const subscription = allowed === 'granted' ? await currentSubscription() : null;
    if (!subscription) { setState({ busy: false, error: '', note: 'Notifications are not available in this browser.' }); return; }
    await api.post('/club/push', { key, subscription }).catch(() => {});
    setState({ busy: false, error: '', note: 'Offers will come to this phone as notifications.' });
  };

  const leave = async () => {
    await api.post('/club/leave', { key }).catch(() => {});
    left();
    setConfirmLeave(false);
    setState({ busy: false, error: '', note: 'You have left the club and your details are deleted.' });
  };

  if (key && card) {
    const left_ = Math.max(0, card.target - card.stamps);
    return (
      <section className="c-club is-member" aria-label="Your stamp card">
        <header className="c-club__head">
          <span className="c-eyebrow c-gold">{restaurant} club</span>
          <b>{card.name}'s card</b>
        </header>
        {card.rewardsReady > 0 && (
          <div className="c-club__reward" role="status">
            <Icon name="star" size={20} fill="currentColor" />
            <span><b>{card.reward}</b><small>{card.rewardsReady > 1 ? `${card.rewardsReady} rewards ready. ` : 'Ready for you. '}Show this to your server.</small></span>
          </div>
        )}
        {card.loyalty && (
          <>
            <Stamps card={card} />
            <p className="c-club__line">
              {card.stamps === 0 && card.visits === 0
                ? `Your first stamp lands when this visit's bill is paid. ${card.target} stamps: ${card.reward.toLowerCase()}.`
                : `${left_} more ${left_ === 1 ? 'visit' : 'visits'} for ${card.reward.toLowerCase()}. A stamp for every visit${card.minSpend ? ` of ${card.minSpend} or more` : ''}, added when the bill is paid.`}
            </p>
          </>
        )}
        {state.note && <p className="c-club__note" role="status">{state.note}</p>}
        <div className="c-club__tools">
          {!card.offers && alertsState() !== 'unsupported' && alertsState() !== 'denied' && (
            <button className="c-club__link c-press" onClick={offersHere}><Icon name="bell" size={14} />Get offers as notifications</button>
          )}
          {confirmLeave
            ? <span className="c-club__confirm">Delete my details? <button className="c-club__link is-danger" onClick={leave}>Yes, leave</button> <button className="c-club__link" onClick={() => setConfirmLeave(false)}>No</button></span>
            : <button className="c-club__link" onClick={() => setConfirmLeave(true)}>Leave the club</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="c-club" aria-label={`${restaurant} guest club`}>
      {!open ? (
        <button className="c-club__pitch c-press" onClick={() => setOpen(true)}>
          <span className="c-club__badge" aria-hidden="true"><Icon name="star" size={20} /></span>
          <span>
            <b>{club.loyalty ? `Collect stamps: ${club.stamps} visits = ${club.reward.toLowerCase()}` : `Join the ${restaurant} club`}</b>
            <small>Plus offers and a treat on your birthday. Takes 20 seconds.</small>
          </span>
          <span className="c-club__go" aria-hidden="true">Join</span>
        </button>
      ) : (
        <form className="c-club__form" onSubmit={join}>
          <h3>Join the club</h3>
          {club.loyalty && <p className="c-muted c-club__small">A stamp for every visit; {club.stamps} stamps and {club.reward.toLowerCase()}. This visit counts.</p>}
          <label className="c-club__label">Your name
            <input className="c-club__input" required maxLength={40} autoComplete="given-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="c-club__label">WhatsApp number
            <span className="c-club__phone"><span>+91</span>
              <input className="c-club__input" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" maxLength={16}
                value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d\s+-]/g, '') })} />
            </span>
          </label>
          <fieldset className="c-club__label c-club__bday">
            <legend>Birthday <span className="c-muted">(optional, for a treat)</span></legend>
            <select className="c-club__input" aria-label="Day" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
              <option value="">Day</option>{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="c-club__input" aria-label="Month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
              <option value="">Month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </fieldset>
          <label className="c-club__consent">
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            <span>Send me offers and reminders from {restaurant} on WhatsApp and as notifications. I can leave any time, and my details are then deleted.</span>
          </label>
          {state.error && <p className="c-wheel__error" role="alert">{state.error}</p>}
          <button className="c-cta is-gold c-press" disabled={state.busy}>{state.busy ? 'Joining…' : 'Join'}</button>
          <button type="button" className="c-club__link" onClick={() => setOpen(false)}>Not now</button>
        </form>
      )}
      {state.note && <p className="c-club__note" role="status">{state.note}</p>}
    </section>
  );
}

const waLink = (number) => `https://wa.me/${String(number).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`;

/** Where to follow, message and review the restaurant. Shows only what the owner filled in. */
export function SocialLinks({ social, review }) {
  if (!social) return null;
  const links = [
    review && social.google && { href: social.google, icon: 'star', label: 'Review us on Google', strong: true },
    social.instagram && { href: social.instagram, icon: 'instagram', label: 'Follow on Instagram' },
    social.whatsapp && { href: waLink(social.whatsapp), icon: 'chat', label: 'WhatsApp us' },
    !review && social.google && { href: social.google, icon: 'star', label: 'Google reviews' },
    social.zomato && { href: social.zomato, icon: 'bag', label: 'Zomato' },
    social.swiggy && { href: social.swiggy, icon: 'bag', label: 'Swiggy' }
  ].filter(Boolean);
  if (!links.length) return null;
  return (
    <nav className="c-social" aria-label="Find us online">
      {links.map((l) => (
        <a key={l.label} className={'c-social__link c-press' + (l.strong ? ' is-strong' : '')} href={l.href} target="_blank" rel="noopener noreferrer">
          <Icon name={l.icon} size={16} />{l.label}
        </a>
      ))}
    </nav>
  );
}
