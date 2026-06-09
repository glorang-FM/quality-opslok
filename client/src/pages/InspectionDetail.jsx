import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

const RESULT_COLORS = {
  pass: 'var(--green)',
  fail: 'var(--red)',
  na:   'var(--text3)',
  pending: 'var(--border2)',
};

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [ncrForm, setNcrForm] = useState({ title: '', description: '', severity: 'minor' });
  const [users, setUsers] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get(`/api/inspections/${id}`),
      api.get('/api/auth/users'),
    ])
      .then(([r1, r2]) => { setInspection(r1.data); setUsers(r2.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const setItemResult = async (itemId, result) => {
    try {
      const { data } = await api.put(`/api/inspections/${id}/items/${itemId}`, { result });
      setInspection(prev => ({
        ...prev,
        items: prev.items.map(i => i.id === itemId ? data : i),
      }));
    } catch (err) {
      console.error('Update item error:', err);
    }
  };

  const completeInspection = async (result) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/api/inspections/${id}`, {
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
      });
      setInspection(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error('Complete inspection error:', err);
    } finally {
      setSaving(false);
    }
  };

  const createNcr = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/ncrs', { ...ncrForm, inspection_id: parseInt(id) });
      setShowNcrModal(false);
      setNcrForm({ title: '', description: '', severity: 'minor' });
      load();
    } catch (err) {
      console.error('Create NCR error:', err);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>;
  if (!inspection) return <div className="empty-state"><p>Inspection not found.</p></div>;

  const passCount = inspection.items?.filter(i => i.result === 'pass').length || 0;
  const failCount = inspection.items?.filter(i => i.result === 'fail').length || 0;
  const totalItems = inspection.items?.length || 0;
  const isComplete = inspection.status === 'completed';

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate('/inspections')} className="btn btn-sm">← Back</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>{inspection.title}</h1>
          <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {inspection.location && <span>📍 {inspection.location}</span>}
            {inspection.batch_number && <span>Batch #{inspection.batch_number}</span>}
            {inspection.inspector_name && <span>Inspector: {inspection.inspector_name}</span>}
            {inspection.template_name && <span>Template: {inspection.template_name}</span>}
          </div>
        </div>
        {!isComplete && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => completeInspection('passed')} disabled={saving} className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green)' }}>
              Mark Passed
            </button>
            <button onClick={() => completeInspection('failed')} disabled={saving} className="btn btn-sm" style={{ background: 'var(--red-bg)', color: 'var(--red-text)', borderColor: 'var(--red)' }}>
              Mark Failed
            </button>
          </div>
        )}
        {isComplete && (
          <span className={`badge ${inspection.result === 'passed' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 13, padding: '4px 12px' }}>
            {inspection.result?.toUpperCase()}
          </span>
        )}
      </div>

      {/* Checklist */}
      {totalItems > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-label">Checklist</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              {passCount} pass · {failCount} fail · {totalItems - passCount - failCount} pending
            </div>
          </div>
          {inspection.items.map(item => (
            <div key={item.id} className="checklist-item">
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {['pass', 'fail', 'na'].map(r => (
                  <button
                    key={r}
                    onClick={() => !isComplete && setItemResult(item.id, r)}
                    disabled={isComplete}
                    style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${RESULT_COLORS[r]}`,
                      background: item.result === r ? RESULT_COLORS[r] : 'transparent',
                      color: item.result === r ? '#fff' : RESULT_COLORS[r],
                      cursor: isComplete ? 'default' : 'pointer',
                      opacity: isComplete && item.result !== r ? 0.35 : 1,
                    }}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 13, flex: 1 }}>{item.description}</span>
              {item.notes && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{item.notes}</span>}
            </div>
          ))}
        </div>
      )}

      {/* NCRs */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-label">Non-Conformances</div>
          <button className="btn btn-sm" onClick={() => setShowNcrModal(true)}>+ Raise NCR</button>
        </div>
        {inspection.ncrs?.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>No NCRs raised for this inspection.</p>
        ) : (
          inspection.ncrs?.map(n => (
            <div
              key={n.id}
              onClick={() => navigate(`/ncrs/${n.id}`)}
              style={{ padding: '8px 0', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{n.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{n.ncr_number}</div>
              </div>
              <span className={`badge ${n.severity === 'critical' ? 'badge-red' : n.severity === 'major' ? 'badge-amber' : 'badge-gray'}`}>
                {n.severity}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Raise NCR Modal */}
      {showNcrModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowNcrModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Raise NCR</h2>
              <button onClick={() => setShowNcrModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={createNcr}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Title *</label>
                <input value={ncrForm.title} onChange={e => setNcrForm(f => ({ ...f, title: e.target.value }))} required autoFocus placeholder="Describe the non-conformance" />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Description</label>
                <textarea value={ncrForm.description} onChange={e => setNcrForm(f => ({ ...f, description: e.target.value }))} placeholder="Details, observations, measurements…" />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Severity</label>
                <select value={ncrForm.severity} onChange={e => setNcrForm(f => ({ ...f, severity: e.target.value }))}>
                  <option value="minor">Minor</option>
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowNcrModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Raise NCR</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
