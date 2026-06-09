import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function ControlPlans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState({ part_id: '', inspection_type: 'incoming' });

  const load = () => {
    setLoading(true);
    api.get('/api/control-plans').then(r => setPlans(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = () => {
    api.get('/api/parts').then(r => setParts(r.data));
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/control-plans', form);
      setShowModal(false);
      navigate(`/control-plans/${data.id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating control plan');
    }
  };

  const approve = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Approve this control plan? Any existing active plan for this part/type will be superseded.')) return;
    try {
      await api.post(`/api/control-plans/${id}/approve`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  const statusBadge = s => ({
    draft: 'badge-gray', active: 'badge-green', superseded: 'badge-gray'
  }[s] || 'badge-gray');

  return (
    <div>
      <div className="page-header">
        <h1>Control Plans</h1>
        <button className="btn btn-primary" onClick={openModal}>+ New Control Plan</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : plans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p>No control plans. Upload a document to auto-generate one, or create manually.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Part</th><th>Rev</th><th>Type</th><th>Status</th><th>Characteristics</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {plans.map(cp => (
                <tr key={cp.id} onClick={() => navigate(`/control-plans/${cp.id}`)}>
                  <td><strong>{cp.part_number}</strong></td>
                  <td>{cp.revision}</td>
                  <td><span className="badge badge-blue">{cp.inspection_type}</span></td>
                  <td><span className={`badge ${statusBadge(cp.status)}`}>{cp.status}</span></td>
                  <td>{cp.characteristic_count}</td>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>{new Date(cp.created_at).toLocaleDateString()}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm" style={{ marginRight: 6 }} onClick={() => navigate(`/control-plans/${cp.id}`)}>Edit</button>
                    {cp.status === 'draft' && (
                      <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green)' }}
                        onClick={e => approve(cp.id, e)}>Approve</button>
                    )}
                  </td>
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
              <h2>New Control Plan</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Part *</label>
                <select required value={form.part_id} onChange={e => setForm(f => ({ ...f, part_id: e.target.value }))}>
                  <option value="">Select part...</option>
                  {parts.map(p => <option key={p.id} value={p.id}>{p.part_number} r{p.revision}</option>)}
                </select>
                {parts.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>No parts found — <a href="/parts">add a part first</a></span>}
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Inspection Type</label>
                <select value={form.inspection_type} onChange={e => setForm(f => ({ ...f, inspection_type: e.target.value }))}>
                  <option value="incoming">Incoming</option>
                  <option value="inprocess">In-Process</option>
                  <option value="preshipment">Pre-Shipment</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
