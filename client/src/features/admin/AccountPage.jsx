import { useState } from 'react';
import { api } from '../../lib/api.js';

/** Your own sign-in: who you are, your role, and your password. Everyone can reach this. */
export default function AccountPage({ me }) {
  const [form, setForm] = useState({ current: '', next: '' });
  const [state, setState] = useState({ busy: false, error: '', ok: '' });

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', ok: '' });
    try {
      await api.put('/auth/password', form);
      setForm({ current: '', next: '' });
      setState({ busy: false, error: '', ok: 'Password changed.' });
    } catch (err) { setState({ busy: false, error: err.message, ok: '' }); }
  };

  return (
    <>
      <div className="a-title"><h1>My <em>account</em></h1></div>
      <section className="a-card a-me">
        <span className="a-person__badge" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
        <span><b>{me.name}</b><small>@{me.username} · {me.role[0].toUpperCase() + me.role.slice(1)}</small></span>
      </section>

      <h2 className="a-sub">Change my password</h2>
      <form className="a-card a-form" onSubmit={save}>
        <label className="a-label">Current password<input required type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></label>
        <label className="a-label">New password <span className="a-hint">at least 8 characters</span>
          <input required type="password" minLength={8} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
        {state.error && <p className="a-error is-wide" role="alert">{state.error}</p>}
        {state.ok && <p className="a-ok is-wide" role="status">{state.ok}</p>}
        <div className="is-wide"><button className="a-btn is-gold" disabled={state.busy}>{state.busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </>
  );
}
