import { useState } from 'react';
import { api } from '../../lib/api.js';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.post('/auth/login', form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a-app a-login">
      <form onSubmit={submit}>
        <h1>Restaurant <em>admin</em></h1>
        <p className="a-muted">Sign in to manage the menu and see orders as they arrive.</p>
        <label className="a-label">Username
          <input autoComplete="username" autoCapitalize="none" required value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label className="a-label">Password
          <input type="password" autoComplete="current-password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="a-error" role="alert">{error}</p>}
        <button className="a-btn is-gold" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
