import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Register() {
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/register-org', {
        orgName: form.orgName,
        name: form.name,
        email: form.email,
        password: form.password,
      });
      localStorage.setItem('ql_token', data.token);
      localStorage.setItem('ql_user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8f8f7', padding: '2rem 1rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#185FA5' }}><strong>Quality</strong> OpsLok</h1>
          <p style={{ fontSize: 13, color: '#8a8a86', marginTop: 4 }}>Create your company account</p>
        </div>

        <div className="card">
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8a8a86', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Your company
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Company name *</label>
              <input value={form.orgName} onChange={e => set('orgName', e.target.value)} placeholder="e.g. Acme Manufacturing" required autoFocus />
            </div>

            <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8a8a86', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Your admin account
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Your name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Jane Smith" required />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Email *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="At least 8 characters" required />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Confirm password *</label>
              <input type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="••••••••" required />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create account & get started'}
            </button>
          </form>

          <p style={{ fontSize: 12, color: '#8a8a86', marginTop: 16, textAlign: 'center' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#185FA5' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
