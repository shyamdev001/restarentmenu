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

export default function SettingsPage({ settings, reload }) {
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr } = settings;
  const main = useForm({ name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr: !!requireQr });
  const pass = useForm({ current: '', next: '' });

  const saveSettings = main.submit(async (form) => { await api.put('/admin/settings', form); await reload(); }, 'Saved. Guests see the change straight away.');
  const savePassword = pass.submit(async (form) => { await api.put('/auth/password', form); pass.setForm({ current: '', next: '' }); }, 'Password changed.');

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
        <Feedback state={main.state} />
        <div className="is-wide"><button className="a-btn is-gold" disabled={main.state.busy}>{main.state.busy ? 'Saving…' : 'Save settings'}</button></div>
      </form>

      <h2 className="a-sub">While guests wait</h2>
      <WheelSettings game={settings.game} reload={reload} />

      <h2 className="a-sub">Change password</h2>
      <form className="a-card a-form" onSubmit={savePassword}>
        <label className="a-label">Current password<input required type="password" autoComplete="current-password" {...pass.field('current')} /></label>
        <label className="a-label">New password <span className="a-hint">at least 8 characters</span>
          <input required type="password" minLength={8} autoComplete="new-password" {...pass.field('next')} /></label>
        <Feedback state={pass.state} />
        <div className="is-wide"><button className="a-btn is-gold" disabled={pass.state.busy}>{pass.state.busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </>
  );
}
