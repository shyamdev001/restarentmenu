import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';

/** What each role is for, in the owner's words. */
const ABOUT = {
  owner: 'Everything, including settings, staff and sales.',
  manager: 'Runs service and the menu, sees sales. Cannot change settings or staff.',
  waiter: 'Enters orders, serves, answers tables, marks bills paid.',
  kitchen: 'Starts and finishes orders, marks dishes sold out. Sees no sales.'
};

/** Staff accounts: who can sign in, and what each of them may do. Owners only. */
export default function StaffPage({ me, setError }) {
  const [staff, setStaff] = useState(null);
  const [roles, setRoles] = useState({});
  const [form, setForm] = useState({ name: '', username: '', role: 'waiter', password: '' });
  const [state, setState] = useState({ busy: false, error: '', ok: '' });
  const [reset, setReset] = useState(null); // { id, password }
  const [confirm, dialog] = useConfirm();

  const load = useCallback(() => api.get('/admin/staff').then((r) => { setStaff(r.staff); setRoles(r.roles); }).catch((e) => setError(e.message)), [setError]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', ok: '' });
    try {
      await api.post('/admin/staff', form);
      setState({ busy: false, error: '', ok: `${form.name} can now sign in as "${form.username.toLowerCase()}".` });
      setForm({ name: '', username: '', role: form.role, password: '' });
      load();
    } catch (err) { setState({ busy: false, error: err.message, ok: '' }); }
  };

  const change = (s, patch) => api.put(`/admin/staff/${s.id}`, patch).then(load).catch((e) => setError(e.message));
  const remove = async (s) => {
    if (await confirm({ title: `Remove ${s.name}?`, body: `They will no longer be able to sign in. Orders they handled keep their name.`, action: 'Remove' })) {
      api.del(`/admin/staff/${s.id}`).then(load).catch((e) => setError(e.message));
    }
  };
  const savePassword = (e) => {
    e.preventDefault();
    api.put(`/admin/staff/${reset.id}`, { password: reset.password })
      .then(() => { setReset(null); setState({ busy: false, error: '', ok: 'Password changed.' }); })
      .catch((err) => setError(err.message));
  };

  return (
    <>
      {dialog}
      <div className="a-title"><h1>Your <em>staff</em></h1></div>
      <p className="a-muted">Give everyone their own sign-in. Each role only sees what it needs, and every order step records who took it.</p>

      <section className="a-card">
        <div className="a-staff">
          {staff?.map((s) => (
            <div key={s.id} className={'a-person' + (s.active ? '' : ' is-off')}>
              <span className="a-person__badge" aria-hidden="true">{s.name.slice(0, 1).toUpperCase()}</span>
              <span className="a-person__who">
                <b>{s.name}{s.id === me.id ? ' (you)' : ''}</b>
                <small>@{s.username}{s.active ? '' : ' · switched off'}</small>
              </span>
              <select className="a-input a-person__role" aria-label={`${s.name}'s role`} value={s.role} disabled={s.id === me.id}
                onChange={(e) => change(s, { role: e.target.value })}>
                {Object.entries(roles).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
              </select>
              <span className="a-person__tools">
                <button className="a-btn" onClick={() => setReset({ id: s.id, name: s.name, password: '' })}>Password</button>
                {s.id !== me.id && (
                  <>
                    <button className="a-switch" role="switch" aria-checked={s.active} aria-label={`${s.name} can sign in`} onClick={() => change(s, { active: !s.active })} />
                    <button className="a-btn is-icon is-danger" aria-label={`Remove ${s.name}`} onClick={() => remove(s)}><Icon name="trash" size={16} /></button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {reset && (
        <form className="a-card a-rowform" onSubmit={savePassword}>
          <label className="a-label" style={{ flex: 1 }}>New password for {reset.name}
            <input className="a-input" type="password" minLength={8} required autoComplete="new-password" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} />
          </label>
          <button className="a-btn is-gold">Save</button>
          <button type="button" className="a-btn" onClick={() => setReset(null)}>Cancel</button>
        </form>
      )}

      <h2 className="a-sub">Add someone</h2>
      <form className="a-card a-form" onSubmit={add}>
        <label className="a-label">Their name<input required maxLength={40} placeholder="Ravi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="a-label">Username <span className="a-hint">what they type to sign in</span>
          <input required minLength={3} maxLength={40} autoCapitalize="none" placeholder="ravi" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label className="a-label">Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(roles).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
          </select>
          <span className="a-hint">{ABOUT[form.role]}</span>
        </label>
        <label className="a-label">Password <span className="a-hint">at least 8 characters; they can change it later</span>
          <input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {state.error && <p className="a-error is-wide" role="alert">{state.error}</p>}
        {state.ok && <p className="a-ok is-wide" role="status">{state.ok}</p>}
        <div className="is-wide"><button className="a-btn is-gold" disabled={state.busy}><Icon name="plus" size={16} />{state.busy ? 'Adding…' : 'Add to staff'}</button></div>
      </form>

      <section className="a-card">
        <h2 className="a-sub" style={{ marginBottom: 10 }}>What each role can do</h2>
        <ul className="a-roles">
          {Object.entries(ABOUT).map(([id, text]) => <li key={id}><b>{roles[id]?.label || id}</b><span>{text}</span></li>)}
        </ul>
      </section>
    </>
  );
}
