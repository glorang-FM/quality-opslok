import React, { useState, useEffect } from 'react';
import api from '../api';

function ScoreBar({ pct }) {
  const color = pct >= 95 ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{pct?.toFixed(1)}%</span>
    </div>
  );
}

function ratingBadge(rate) {
  if (rate == null) return <span className="badge badge-gray">No Data</span>;
  if (rate >= 95) return <span className="badge badge-green">Preferred</span>;
  if (rate >= 80) return <span className="badge badge-amber">Conditional</span>;
  return <span className="badge badge-red">At Risk</span>;
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', contact_email: '' });

  const load = () => {
    setLoading(true);
    api.get('/api/suppliers').then(r => setSuppliers(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/suppliers', form);
      setShowModal(false);
      setForm({ name: '', code: '', contact_email: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating supplier');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Supplier Scorecard</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Supplier</button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, padding: '10px 14px', background: 'var(--blue-bg)', borderRadius: 8, color: 'var(--blue-text)' }}>
        Scores are computed automatically from actual inspection readings — no manual entry. In-spec rate is calculated from every measurement taken against this supplier's parts.
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
          <p>No suppliers yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Supplier</th><th>Code</th><th>Inspections</th><th>In-Spec Rate</th><th>Pass Rate</th><th>Rating</th></tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.contact_email && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.contact_email}</div>}</td>
                  <td style={{ color: 'var(--text2)' }}>{s.code || '-'}</td>
                  <td>{s.total_inspections || 0}</td>
                  <td>{s.in_spec_rate_pct != null ? <ScoreBar pct={parseFloat(s.in_spec_rate_pct)} /> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>No readings</span>}</td>
                  <td>{s.pass_rate_pct != null ? `${parseFloat(s.pass_rate_pct).toFixed(1)}%` : '-'}</td>
                  <td>{ratingBadge(s.in_spec_rate_pct != null ? parseFloat(s.in_spec_rate_pct) : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>New Supplier</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Supplier Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Supplier Code</label>
                  <input placeholder="SUP-001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Contact Email</label>
                  <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
