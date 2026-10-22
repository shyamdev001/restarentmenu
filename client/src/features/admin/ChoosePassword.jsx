import { useState } from 'react';
import { api } from '../../lib/api.js';

/**
 * Shown instead of the panel when someone signs in with a password another
 * person chose: the first owner on a new install, a new member of staff, or
 * after a reset. Nothing else opens until they choose their own.
 */
export default function ChoosePassword({ user, onDone, onLogout }) {
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 8) { setError('Use at least 8 characters.'); return; }
    if (form.next !== form.again) { setError('The two new passwords are not the same.'); return; }
    setBusy(true); setError('');
    try { onDone(await api.put('/auth/password', { current: form.current, next: form.next })); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  const field = (name) => ({ value: form[name], onChange: (e) => { setForm({ ...form, [name]: e.target.value }); setError(''); } });

  return (
    <div className="a-app a-login">
      <form onSubmit={submit}>
        <h1>Your own <em>password</em></h1>
        <p className="a-muted">Welcome, {user.name}. The password you just used was set for you, or is the one every new install starts with. Choose one only you know before you start.</p>
        <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
        <label className="a-label">Password you just used
          <input type="password" autoComplete="current-password" required {...field('current')} />
        </label>
        <label className="a-label">New password <span className="a-hint">at least 8 characters</span>
          <input type="password" autoComplete="new-password" required minLength={8} {...field('next')} />
        </label>
        <label className="a-label">New password again
          <input type="password" autoComplete="new-password" required minLength={8} {...field('again')} />
        </label>
        {error && <p className="a-error" role="alert">{error}</p>}
        <button className="a-btn is-gold" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button type="button" className="a-btn" onClick={onLogout}>Sign out</button>
      </form>
    </div>
  );
}
