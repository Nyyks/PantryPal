import { useState } from 'react';
import { api, setToken, setStoredUser } from '../utils/api';
import { LogIn, AlertCircle } from 'lucide-react';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.login(username, password);
      setToken(result.token);
      setStoredUser(result.user);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20, background: 'var(--bg-primary)',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
            Pantry<span style={{ color: 'var(--accent)' }}>Pal</span>
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Home Inventory
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>Sign In</h3>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'var(--red-muted)', borderRadius: 6, marginBottom: 16,
              fontSize: 13, color: 'var(--red)',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input autoFocus required value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Enter username" autoComplete="username" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter password" autoComplete="current-password" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, marginTop: 8 }}>
              {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><LogIn size={16} /> Sign In</>}
            </button>
          </form>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 16 }}>
            Default: admin / admin — Ask an admin to create your account.
          </p>
        </div>
      </div>
    </div>
  );
}
