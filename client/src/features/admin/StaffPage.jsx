import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';

/** What each role is for, in the owner's words, and the main things it can do. */
const ABOUT = {
  owner: { text: 'Everything: settings, staff, sales and the menu.', can: ['Settings', 'Staff', 'Reports', 'Menu', 'Orders'] },
  manager: { text: 'Runs service and the menu, sees sales. Cannot change settings or staff.', can: ['Reports', 'Menu', 'QR codes', 'Orders', 'Cancel'] },
  waiter: { text: 'Takes orders, serves, answers tables, marks bills paid.', can: ['Enter orders', 'Serve', 'Table calls', 'Mark paid'] },
  kitchen: { text: 'Starts and finishes orders, marks dishes sold out. Sees no money.', can: ['Kitchen screen', 'Cook', 'Sold out'] }
};
const ROLE_ORDER = ['owner', 'manager', 'waiter', 'kitchen'];
const label = (role) => role[0].toUpperCase() + role.slice(1);
// How a role reads in a sentence: "Ravi is now a waiter", "Asha is now kitchen staff".
const AS = { owner: 'an owner', manager: 'a manager', waiter: 'a waiter', kitchen: 'kitchen staff' };

// Usernames are typed on phones: lower case, no spaces, only what the server accepts.
const cleanUsername = (v) => v.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').slice(0, 40);

/** A password that is easy to read out to someone: two words and a number, no look-alike letters. */
function suggestPassword() {
  const words = ['saffron', 'pepper', 'mango', 'ginger', 'cumin', 'tamarind', 'basil', 'cocoa', 'lemon', 'clove', 'masala', 'paneer', 'chutney', 'mint'];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${100 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900)}`;
}

function PasswordInput({ value, onChange, id, autoFocus }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="a-pass">
      <input id={id} className="a-input" type={shown ? 'text' : 'password'} minLength={8} maxLength={100} required autoComplete="new-password"
        autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="a-pass__show" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'}>{shown ? 'Hide' : 'Show'}</button>
      <button type="button" className="a-pass__show" onClick={() => { onChange(suggestPassword()); setShown(true); }}>Suggest</button>
    </span>
  );
}

/** One person: who they are, their role, whether they can sign in, and an inline editor. */
function Person({ s, me, roles, busy, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [password, setPassword] = useState('');
  const [tooShort, setTooShort] = useState(false);
  const self = s.id === me.id;
  const save = async (e) => {
    e.preventDefault();
    if (password && password.length < 8) { setTooShort(true); return; }
    const patch = {};
    if (name.trim() && name.trim() !== s.name) patch.name = name.trim();
    if (password) patch.password = password;
    if (!Object.keys(patch).length) { setEditing(false); return; }
    const ok = await onChange(s, patch, patch.password
      ? (self ? 'Your password is changed.' : `${patch.name || s.name}'s temporary password is "${password}". Tell them: they choose their own when they next sign in.`)
      : `Saved ${patch.name}.`);
    if (ok) { setEditing(false); setPassword(''); }
  };
  return (
    <li className={'a-person' + (s.active ? '' : ' is-off') + (editing ? ' is-editing' : '')}>
      <span className="a-person__badge" aria-hidden="true">{s.name.slice(0, 1).toUpperCase()}</span>
      <span className="a-person__who">
        <b>{s.name}{self && <em className="a-tag">You</em>}</b>
        <small>@{s.username}{!s.active && <em className="a-tag is-off">Switched off</em>}</small>
      </span>
      {self
        ? <span className="a-person__role is-fixed">{label(s.role)}</span>
        : (
          <select className="a-input a-person__role" aria-label={`${s.name}'s role`} value={s.role} disabled={busy}
            onChange={(e) => onChange(s, { role: e.target.value }, `${s.name} is now ${AS[e.target.value]}. Their screen updates within a minute.`)}>
            {ROLE_ORDER.map((id) => <option key={id} value={id}>{roles[id]?.label || label(id)}</option>)}
          </select>
        )}
      <span className="a-person__tools">
        {!self && (
          <label className="a-person__on">
            <button className="a-switch" role="switch" aria-checked={s.active} disabled={busy}
              aria-label={`${s.name} can sign in`}
              onClick={() => onChange(s, { active: !s.active }, s.active ? `${s.name} is switched off and signed out.` : `${s.name} can sign in again.`)} />
            <span aria-hidden="true">{s.active ? 'Can sign in' : 'Off'}</span>
          </label>
        )}
        <button className={'a-btn' + (editing ? ' is-on' : '')} aria-expanded={editing} onClick={() => { setEditing(!editing); setName(s.name); setPassword(''); }}>
          <Icon name="pen" size={15} />Edit
        </button>
        {!self && <button className="a-btn is-icon is-danger" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => onRemove(s)}><Icon name="trash" size={16} /></button>}
      </span>

      {editing && (
        <form className="a-person__edit" onSubmit={save}>
          <label className="a-label">Name
            <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="a-label">
            <label htmlFor={'pw-' + s.id}>New password</label>
            <PasswordInput id={'pw-' + s.id} value={password} onChange={(v) => { setPassword(v); setTooShort(false); }} />
            {tooShort && <span className="a-error" role="alert">At least 8 characters, please.</span>}
            <span className="a-hint">{self ? 'Leave empty to keep it.' : 'Leave empty to keep it. Use this when they forget theirs.'}</span>
          </div>
          <div className="a-person__editbar">
            <button className="a-btn is-gold" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="a-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </li>
  );
}

/** Staff accounts: who can sign in, and what each of them may do. Owners only. */
export default function StaffPage({ me }) {
  const [staff, setStaff] = useState(null);
  const [roles, setRoles] = useState({});
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', username: '', role: 'waiter', password: '' });
  const [adding, setAdding] = useState({ busy: false, error: '' });
  const [busyId, setBusyId] = useState('');
  const [flash, setFlash] = useState(null); // { tone: 'ok' | 'error', text }
  const [confirm, dialog] = useConfirm();
  const flashTimer = useRef();

  const say = (tone, text, long) => {
    setFlash({ tone, text });
    clearTimeout(flashTimer.current);
    if (tone === 'ok') flashTimer.current = setTimeout(() => setFlash(null), long ? 20000 : 5000);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const load = useCallback(() => api.get('/admin/staff')
    .then((r) => { setStaff(r.staff); setRoles(r.roles); setLoadError(''); })
    .catch((e) => setLoadError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const change = async (s, patch, done) => {
    setBusyId(s.id);
    try {
      const updated = await api.put(`/admin/staff/${s.id}`, patch);
      setStaff((list) => list.map((x) => (x.id === s.id ? updated : x)));
      say('ok', done, !!patch.password);
      return true;
    } catch (e) {
      say('error', e.message);
      return false;
    } finally { setBusyId(''); }
  };

  const remove = async (s) => {
    const yes = await confirm({ title: `Remove ${s.name}?`, body: 'They are signed out and can no longer sign in. Orders they handled keep their name.', action: 'Remove', danger: true });
    if (!yes) return;
    setBusyId(s.id);
    try {
      await api.del(`/admin/staff/${s.id}`);
      setStaff((list) => list.filter((x) => x.id !== s.id));
      say('ok', `${s.name} has been removed.`);
    } catch (e) { say('error', e.message); } finally { setBusyId(''); }
  };

  const add = async (e) => {
    e.preventDefault();
    if (form.username.length < 3) { setAdding({ busy: false, error: 'The username needs at least 3 letters or numbers.' }); return; }
    if (form.password.length < 8) { setAdding({ busy: false, error: 'The password needs at least 8 characters. Tap Suggest for one.' }); return; }
    setAdding({ busy: true, error: '' });
    try {
      const made = await api.post('/admin/staff', { ...form, name: form.name.trim() });
      setStaff((list) => [...(list || []), made]);
      say('ok', `${made.name} can sign in with username "${made.username}" and temporary password "${form.password}". They choose their own the first time they sign in.`, true);
      setForm({ name: '', username: '', role: form.role, password: '' });
      setAdding({ busy: false, error: '' });
    } catch (err) { setAdding({ busy: false, error: err.message }); }
  };

  const counts = ROLE_ORDER.map((r) => [r, staff?.filter((s) => s.role === r && s.active).length || 0]).filter(([, n]) => n);

  return (
    <>
      {dialog}
      <div className="a-title"><h1>Your <em>staff</em></h1></div>
      <p className="a-muted a-lede">Give everyone their own sign-in. Each role only sees what it needs, and every order records who moved it.</p>

      <section className="a-card a-staffcard" aria-label="Staff accounts">
        <header className="a-staffcard__head">
          <h2 className="a-sub">Team</h2>
          {counts.length > 0 && <span className="a-muted a-small">{counts.map(([r, n]) => `${n} ${label(r).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}</span>}
        </header>
        {flash && (
          <p className={flash.tone === 'ok' ? 'a-flash' : 'a-flash is-error'} role={flash.tone === 'ok' ? 'status' : 'alert'}>
            <Icon name={flash.tone === 'ok' ? 'check' : 'close'} size={16} strokeWidth={2.4} /><span>{flash.text}</span>
            <button className="a-flash__x" onClick={() => setFlash(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          </p>
        )}
        {loadError && <p className="a-error" role="alert">{loadError} <button className="a-btn" onClick={load}>Try again</button></p>}
        {!staff && !loadError && <p className="a-muted a-small" style={{ padding: '14px 0' }}>Loading…</p>}
        {staff && (
          <ul className="a-staff">
            {staff.map((s) => <Person key={s.id} s={s} me={me} roles={roles} busy={busyId === s.id} onChange={change} onRemove={remove} />)}
          </ul>
        )}
        {staff?.length === 1 && <p className="a-muted a-small a-staffcard__alone">Only you so far. Add your waiters and cooks below so each has their own sign-in.</p>}
      </section>

      <h2 className="a-sub">Add someone</h2>
      <form className="a-card a-form a-staffform" onSubmit={add} noValidate={false}>
        <div className="a-label">
          <label htmlFor="st-name">Their name</label>
          <input id="st-name" className="a-input" required maxLength={40} placeholder="Ravi" value={form.name}
            onChange={(e) => {
              const name = e.target.value;
              // Fill the username from the name until the owner types their own.
              const auto = !form.username || form.username === cleanUsername(form.name.split(' ')[0] || '');
              setForm({ ...form, name, username: auto ? cleanUsername(name.split(' ')[0] || '') : form.username });
            }} />
        </div>
        <div className="a-label">
          <label htmlFor="st-user">Username</label>
          <input id="st-user" className="a-input" required minLength={3} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="ravi" value={form.username} onChange={(e) => setForm({ ...form, username: cleanUsername(e.target.value) })} />
          <span className="a-hint">What they type to sign in. Small letters, numbers, dots.</span>
        </div>
        <fieldset className="is-wide a-rolepick">
          <legend>Role</legend>
          <div className="a-rolepick__list">
            {ROLE_ORDER.map((id) => (
              <label key={id} className={'a-rolepick__item' + (form.role === id ? ' is-on' : '')}>
                <input type="radio" name="role" value={id} checked={form.role === id} onChange={() => setForm({ ...form, role: id })} />
                <b>{roles[id]?.label || label(id)}</b>
                <span>{ABOUT[id].text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="a-label is-wide">
          <label htmlFor="st-pass">Password</label>
          <PasswordInput id="st-pass" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <span className="a-hint">A temporary one, at least 8 characters: they choose their own at first sign-in. Tap Suggest for one that is easy to read out.</span>
        </div>
        {adding.error && <p className="a-error is-wide" role="alert">{adding.error}</p>}
        <div className="is-wide"><button className="a-btn is-gold" disabled={adding.busy}><Icon name="plus" size={16} />{adding.busy ? 'Adding…' : `Add ${form.name.trim() || 'to staff'}`}</button></div>
      </form>

      <section className="a-card" aria-label="What each role can do">
        <h2 className="a-sub" style={{ marginBottom: 12 }}>What each role can do</h2>
        <ul className="a-roles">
          {ROLE_ORDER.map((id) => (
            <li key={id}>
              <b>{roles[id]?.label || label(id)}</b>
              <span>{ABOUT[id].text}<span className="a-roles__chips">{ABOUT[id].can.map((c) => <i key={c}>{c}</i>)}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
