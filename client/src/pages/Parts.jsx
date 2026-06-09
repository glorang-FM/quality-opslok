import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Parts() {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ part_number: '', description: '', revision: 'A' });

  const load = () => {
    setLoading(true);
    api.get('/api/parts').then(r => setParts(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/parts', form);
      setShowModal(false);
      setForm({ part_number: '', description: '', revision: 'A' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating part');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Parts Master</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Part</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : parts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
          <p>No parts yet. Parts are the foundation for control plans and inspection orders.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Part Number</th><th>Description</th><th>Revision</th><th>Control Plans</th><th>Created</th></tr>
            </thead>
            <tbody>
              {parts.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.part_number}</strong></td>
                  <td style={{ color: 'var(--text2)' }}>{p.description || '-'}</td>
                  <td>{p.revision}</td>
                  <td>{p.plan_count || 0}</td>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</td>
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
              <h2>New Part</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Part Number *</label>
                <input required placeholder="PN-12345" value={form.part_number}
                  onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))} />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Description</label>
                  <input placeholder="Valve body assembly" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Revision</label>
                  <input placeholder="A" value={form.revision}
                    onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Part</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
