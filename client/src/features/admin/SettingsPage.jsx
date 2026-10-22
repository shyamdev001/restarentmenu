import { useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';

function useForm(initial) {
  const [form, setForm] = useState(initial);
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const field = (name) => ({ value: form[name] ?? '', onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })) });
  const submit = (action, okText) => async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', ok: '' });
    try { await action(form); setState({ busy: false, error: '', ok: okText }); }
    catch (err) { setState({ busy: false, error: err.message, ok: '' }); }
  };
  return { form, setForm, state, field, submit };
}

const Feedback = ({ state }) => (
  <>
    {state.error && <p className="a-error is-wide" role="alert">{state.error}</p>}
    {state.ok && <p className="a-ok is-wide" role="status">{state.ok}</p>}
  </>
);

/** The wheel guests spin while they wait: on or off, and what is on it. */
function WheelSettings({ game, reload }) {
  const [on, setOn] = useState(!!game?.on);
  const [prizes, setPrizes] = useState(game?.prizes || []);
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const total = prizes.reduce((n, p) => n + (Number(p.weight) || 0), 0);
  const edit = (i, change) => setPrizes((list) => list.map((p, n) => (n === i ? { ...p, ...change } : p)));

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', ok: '' });
    try {
      await api.put('/admin/settings/game', { on, prizes: prizes.map((p) => ({ label: p.label, weight: Number(p.weight) || 1, win: !!p.win })) });
      await reload();
      setState({ busy: false, error: '', ok: on ? 'Saved. Guests can spin once per table, per visit.' : 'Saved. The wheel is off.' });
    } catch (err) { setState({ busy: false, error: err.message, ok: '' }); }
  };

  return (
    <form className="a-card a-wheelform" onSubmit={save}>
      <label className="a-check">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span>Let guests spin a wheel while they wait
          <span className="a-hint" style={{ display: 'block' }}>One spin per table, per visit. A prize shows on the order so staff can honour it. The chance is each segment's share of the total.</span>
        </span>
      </label>

      <div className="a-wheelrows">
        {prizes.map((p, i) => (
          <div key={i} className="a-wheelrow">
            <input className="a-input" aria-label="What the segment says" maxLength={30} placeholder="Free masala chai" value={p.label} onChange={(e) => edit(i, { label: e.target.value })} />
            <label className="a-wheelrow__share">Share
              <input className="a-input" type="number" min="1" max="100" aria-label="Share of the wheel" value={p.weight} onChange={(e) => edit(i, { weight: e.target.value })} />
            </label>
            <span className="a-wheelrow__odds">{total ? Math.round(((Number(p.weight) || 0) / total) * 100) : 0}%</span>
            <label className="a-check a-wheelrow__win"><input type="checkbox" checked={!!p.win} onChange={(e) => edit(i, { win: e.target.checked })} />A prize</label>
            <button type="button" className="a-btn is-icon" aria-label="Remove this segment" disabled={prizes.length <= 2} onClick={() => setPrizes((list) => list.filter((_, n) => n !== i))}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="a-btn" style={{ alignSelf: 'flex-start' }} disabled={prizes.length >= 8} onClick={() => setPrizes((list) => [...list, { label: '', weight: 2, win: true }])}><Icon name="plus" size={16} />Add a segment</button>

      <p className="a-muted a-small">Guests win something on about {total ? Math.round((prizes.filter((p) => p.win).reduce((n, p) => n + (Number(p.weight) || 0), 0) / total) * 100) : 0}% of spins.</p>
      <Feedback state={state} />
      <div><button className="a-btn is-gold" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save the wheel'}</button></div>
    </form>
  );
}

/** Links guests see after the meal, the guest club, its stamp card, and reminders. */
function ClubSettings({ settings, reload }) {
  const s = settings.social || {};
  const c = settings.club || {};
  const [form, setForm] = useState({
    instagram: s.instagram || '', whatsapp: s.whatsapp || '', google: s.google || '', zomato: s.zomato || '', swiggy: s.swiggy || '',
    on: c.on !== false, loyalty: c.loyalty !== false, stamps: c.stamps || 5, reward: c.reward || 'A dessert on us', minSpend: c.minSpend || 0,
    remind: !!c.remind, remindDays: c.remindDays || 30, missYou: c.missYou || '', birthday: c.birthday || ''
  });
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const field = (name) => ({ value: form[name], onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })) });
  const check = (name) => ({ checked: !!form[name], onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.checked })) });

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', ok: '' });
    try {
      await api.put('/admin/settings/club', {
        social: { instagram: form.instagram, whatsapp: form.whatsapp, google: form.google, zomato: form.zomato, swiggy: form.swiggy },
        club: { on: form.on, loyalty: form.loyalty, stamps: Number(form.stamps), reward: form.reward, minSpend: Number(form.minSpend) || 0,
          remind: form.remind, remindDays: Number(form.remindDays), missYou: form.missYou, birthday: form.birthday }
      });
      await reload();
      setState({ busy: false, error: '', ok: 'Saved. Guests see it straight away.' });
    } catch (err) { setState({ busy: false, error: err.message, ok: '' }); }
  };

  return (
    <form className="a-card a-form" onSubmit={save}>
      <h2 className="a-sub is-wide">Find us online <span className="a-hint">shown to guests after the meal; leave empty to hide</span></h2>
      <label className="a-label">Instagram<input type="url" placeholder="https://instagram.com/yourrestaurant" {...field('instagram')} /></label>
      <label className="a-label">WhatsApp number<input type="tel" placeholder="+91 98765 43210" {...field('whatsapp')} /></label>
      <label className="a-label is-wide">Google review link <span className="a-hint">Google Business Profile → Ask for reviews → copy the link. Guests who give 4 or 5 stars are asked to post it there.</span>
        <input type="url" placeholder="https://g.page/r/…/review" {...field('google')} /></label>
      <label className="a-label">Zomato<input type="url" placeholder="https://www.zomato.com/…" {...field('zomato')} /></label>
      <label className="a-label">Swiggy<input type="url" placeholder="https://www.swiggy.com/…" {...field('swiggy')} /></label>

      <h2 className="a-sub is-wide a-form__head">Guest club and stamp card</h2>
      <label className="a-check is-wide"><input type="checkbox" {...check('on')} />
        <span>Invite guests to join the club
          <span className="a-hint" style={{ display: 'block' }}>They leave their name, WhatsApp number and, if they like, their birthday. They must tick the box themselves, and can leave any time, which deletes them. You then see them under Guests.</span>
        </span>
      </label>
      {form.on && (
        <>
          <label className="a-check is-wide"><input type="checkbox" {...check('loyalty')} /><span>Give a stamp for every paid visit</span></label>
          {form.loyalty && (
            <>
              <label className="a-label">Stamps for a reward<input type="number" min="2" max="20" required {...field('stamps')} /></label>
              <label className="a-label">The reward<input maxLength={60} required placeholder="A dessert on us" {...field('reward')} /></label>
              <label className="a-label">Smallest bill that earns a stamp <span className="a-hint">0 for any bill</span>
                <input type="number" min="0" step="1" {...field('minSpend')} /></label>
            </>
          )}

          <h2 className="a-sub is-wide a-form__head">Reminders</h2>
          <label className="a-check is-wide"><input type="checkbox" {...check('remind')} />
            <span>Send reminders automatically
              <span className="a-hint" style={{ display: 'block' }}>A notification, between 10 am and 8 pm, to members who allowed notifications: once when they have not visited for a while, and on their birthday.</span>
            </span>
          </label>
          {form.remind && (
            <>
              <label className="a-label">"We miss you" after (days)<input type="number" min="7" max="365" required {...field('remindDays')} /></label>
              <span />
              <label className="a-label is-wide">"We miss you" message <span className="a-hint">{'{name}'} becomes their first name</span>
                <input maxLength={200} required placeholder="We miss you, {name}! Come back this week and the chai is on us." {...field('missYou')} /></label>
              <label className="a-label is-wide">Birthday message
                <input maxLength={200} required placeholder="Happy birthday, {name}! Visit us this month for a treat on the house." {...field('birthday')} /></label>
            </>
          )}
        </>
      )}
      <Feedback state={state} />
      <div className="is-wide"><button className="a-btn is-gold" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  );
}

export default function SettingsPage({ settings, reload }) {
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr, address = '', phone = '', gstin = '', billNote = '' } = settings;
  const main = useForm({ name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr: !!requireQr, address, phone, gstin, billNote });

  const saveSettings = main.submit(async (form) => { await api.put('/admin/settings', form); await reload(); }, 'Saved. Guests see the change straight away.');

  return (
    <>
      <div className="a-title"><h1>Restaurant <em>settings</em></h1></div>

      <form className="a-card a-form" onSubmit={saveSettings}>
        <label className="a-label">Restaurant name<input required maxLength={60} {...main.field('name')} /></label>
        <label className="a-label">Tagline<input maxLength={80} {...main.field('tagline')} /></label>
        <label className="a-label is-wide">Welcome message<textarea maxLength={200} {...main.field('welcome')} /></label>
        <label className="a-label">Currency symbol<input required maxLength={4} {...main.field('currency')} /></label>
        <label className="a-label">Tax (%)<input required type="number" min="0" max="50" step="0.1" {...main.field('taxPercent')} /></label>
        <label className="a-label">Number of tables<input required type="number" min="1" max="500" {...main.field('tables')} /></label>
        <label className="a-label">Public website address <span className="a-hint">used in the QR codes, e.g. https://menu.yourrestaurant.com</span>
          <input type="url" placeholder="https://" {...main.field('publicUrl')} /></label>
        <label className="a-check is-wide">
          <input type="checkbox" checked={!!main.form.requireQr} onChange={(e) => main.setForm((f) => ({ ...f, requireQr: e.target.checked }))} />
          <span>Only take orders from a scanned table QR code
            <span className="a-hint" style={{ display: 'block' }}>Off: any link to the menu can order, and guests without a table pick one from a list. On: only the QR cards from Tables &amp; QR can order, so nobody can send food to a table by typing its number. Print the cards before you turn this on.</span>
          </span>
        </label>
        <h2 className="a-sub is-wide a-form__head">On the printed bill</h2>
        <label className="a-label is-wide">Address<input maxLength={160} placeholder="12 MG Road, Bengaluru 560001" {...main.field('address')} /></label>
        <label className="a-label">Phone<input type="tel" maxLength={30} {...main.field('phone')} /></label>
        <label className="a-label">GSTIN <span className="a-hint">15 characters. With it, the bill is a tax invoice with CGST and SGST.</span>
          <input maxLength={15} autoCapitalize="characters" spellCheck={false} placeholder="29ABCDE1234F1Z5" {...main.field('gstin')} /></label>
        <label className="a-label is-wide">Line at the bottom<input maxLength={120} placeholder="Thank you. Please visit again." {...main.field('billNote')} /></label>
        <Feedback state={main.state} />
        <div className="is-wide"><button className="a-btn is-gold" disabled={main.state.busy}>{main.state.busy ? 'Saving…' : 'Save settings'}</button></div>
      </form>

      <h2 className="a-sub">Guests, loyalty and social</h2>
      <ClubSettings settings={settings} reload={reload} />

      <h2 className="a-sub">While guests wait</h2>
      <WheelSettings game={settings.game} reload={reload} />

      <p className="a-muted a-small">Your own password is under My account.</p>
    </>
  );
}
