import React, { useState, useEffect } from 'react';
import api from '../api';

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function statusBadge(g) {
  if (g.status === 'retired') return <span className="badge badge-gray">Retired</span>;
  if (g.status === 'out_for_cal') return <span className="badge badge-blue">Out for Cal</span>;
  if (isOverdue(g.calibration_due) || g.status === 'overdue') return <span className="badge badge-red">⚠ Overdue</span>;
  return <span className="badge badge-green">Current</span>;
}

export default function Gauges() {
  const [gauges, setGauges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', serial_number: '', calibration_due: '', status: 'current' });

  const load = () => {
    setLoading(true);
    api.get('/api/gauges').then(r => setGauges(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/gauges', form);
      setShowModal(false);
      setForm({ name: '', type: '', serial_number: '', calibration_due: '', status: 'current' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error adding gauge');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/api/gauges/${id}`, { status });
      load();
    } catch (err) { alert('Error updating gauge'); }
  };

  const overdueCount = gauges.filter(g => isOverdue(g.calibration_due) && g.status === 'current').length;

  return (
    <div>
      <div className="page-header">
        <h1>Gauge Calibration</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Register Gauge</button>
      </div>

      {overdueCount > 0 && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', color: 'var(--red-text)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
          ⚠ {overdueCount} gauge{overdueCount > 1 ? 's' : ''} overdue for calibration
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : gauges.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📏</div>
          <p>No gauges registered.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Gauge Name</th><th>Type</th><th>Serial #</th><th>Cal Due</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {gauges.map(g => (
                <tr key={g.id}>
                  <td><strong>{g.name}</strong></td>
                  <td style={{ color: 'var(--text2)' }}>{g.type || '-'}</td>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>{g.serial_number || '-'}</td>
                  <td style={{ color: isOverdue(g.calibration_due) ? 'var(--red)' : 'inherit', fontWeight: isOverdue(g.calibration_due) ? 600 : 400 }}>
                    {g.calibration_due ? new Date(g.calibration_due).toLocaleDateString() : '-'}
                  </td>
                  <td>{statusBadge(g)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <select value={g.status} onChange={e => updateStatus(g.id, e.target.value)}
                      style={{ width: 'auto', fontSize: 12 }}>
                      <option value="current">Current</option>
                      <option value="out_for_cal">Out for Cal</option>
                      <option value="overdue">Overdue</option>
                      <option value="retired">Retired</option>
                    </select>
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
              <h2>Register Gauge</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Gauge Name *</label>
                <input required placeholder="Micrometer #3" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Type</label>
                  <input placeholder="Micrometer, Caliper, CMM…" value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Serial Number</label>
                  <input placeholder="SN-12345" value={form.serial_number}
                    onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Calibration Due Date</label>
                <input type="date" value={form.calibration_due}
                  onChange={e => setForm(f => ({ ...f, calibration_due: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Register</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
