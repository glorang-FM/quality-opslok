import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const RESULT_BADGE = { passed: 'badge-green', failed: 'badge-red' };
const STATUS_BADGE  = { open: 'badge-gray', in_progress: 'badge-blue', passed: 'badge-green', failed: 'badge-red', cancelled: 'badge-gray' };

export default function Inspections() {
  const [inspections, setInspections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ title: '', template_id: '', location: '', batch_number: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/inspections'),
      api.get('/api/templates'),
    ])
      .then(([r1, r2]) => { setInspections(r1.data); setTemplates(r2.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = filter
    ? inspections.filter(i => (i.status === filter || i.result === filter))
    : inspections;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const template = templates.find(t => t.id === parseInt(form.template_id));
      const items = template ? template.items : [];
      const { data } = await api.post('/api/inspections', { ...form, items, template_id: form.template_id || null });
      setShowModal(false);
      setForm({ title: '', template_id: '', location: '', batch_number: '', category: '' });
      navigate(`/inspections/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create inspection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Inspections</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Inspection</button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'open', 'in_progress', 'passed', 'failed'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className="btn btn-sm"
            style={{ background: filter === f ? 'var(--blue)' : undefined, color: filter === f ? '#fff' : undefined, borderColor: filter === f ? 'var(--blue)' : undefined }}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>◫</div>
          <p>No inspections found. Create your first one above.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Location</th>
                <th>Inspector</th>
                <th>Items</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => (
                <tr key={i.id} onClick={() => navigate(`/inspections/${i.id}`)}>
                  <td style={{ fontWeight: 500 }}>
                    {i.title}
                    {i.batch_number && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>#{i.batch_number}</span>}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>{i.location || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>{i.inspector_name || '—'}</td>
                  <td style={{ color: 'var(--text2)' }}>
                    {i.item_count > 0
                      ? <span>{i.item_count - (i.fail_count || 0)}/{i.item_count} pass</span>
                      : '—'
                    }
                  </td>
                  <td>
                    {i.result
                      ? <span className={`badge ${RESULT_BADGE[i.result] || 'badge-gray'}`}>{i.result}</span>
                      : <span className={`badge ${STATUS_BADGE[i.status] || 'badge-gray'}`}>{i.status}</span>
                    }
                  </td>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>
                    {new Date(i.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Inspection Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>New Inspection</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Incoming material check" required autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Template</label>
                  <select value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
                    <option value="">— Ad-hoc (no template) —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Incoming" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Location</label>
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Receiving dock" />
                </div>
                <div className="form-group">
                  <label>Batch / Lot #</label>
                  <input value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} placeholder="e.g. LOT-2024-001" />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Create Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
