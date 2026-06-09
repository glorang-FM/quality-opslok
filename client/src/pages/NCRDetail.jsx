import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['open', 'investigating', 'resolved', 'closed'];
const SEVERITIES = ['minor', 'major', 'critical'];

export default function NCRDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ncr, setNcr] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionForm, setActionForm] = useState({ description: '', assigned_to: '', due_date: '' });

  const load = () => {
    setLoading(true);
    Promise.all([api.get(`/api/ncrs/${id}`), api.get('/api/auth/users')])
      .then(([r1, r2]) => {
        setNcr(r1.data);
        setUsers(r2.data);
        setForm({
          title: r1.data.title,
          description: r1.data.description || '',
          severity: r1.data.severity,
          status: r1.data.status,
          assigned_to: r1.data.assigned_to || '',
          due_date: r1.data.due_date || '',
          root_cause: r1.data.root_cause || '',
          notes: r1.data.notes || '',
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put(`/api/ncrs/${id}`, {
        ...form,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
      });
      setNcr(prev => ({ ...prev, ...data }));
      setEditing(false);
    } catch (err) {
      console.error('Save NCR error:', err);
    } finally {
      setSaving(false);
    }
  };

  const addAction = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/ncrs/${id}/actions`, {
        ...actionForm,
        assigned_to: actionForm.assigned_to || null,
        due_date: actionForm.due_date || null,
      });
      setShowActionModal(false);
      setActionForm({ description: '', assigned_to: '', due_date: '' });
      load();
    } catch (err) {
      console.error('Add action error:', err);
    }
  };

  const completeAction = async (actionId) => {
    try {
      await api.put(`/api/ncrs/${id}/actions/${actionId}`, { status: 'completed' });
      load();
    } catch (err) {
      console.error('Complete action error:', err);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>;
  if (!ncr) return <div className="empty-state"><p>NCR not found.</p></div>;

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => navigate('/ncrs')} className="btn btn-sm">← Back</button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace', marginBottom: 4 }}>{ncr.ncr_number}</div>
            <h2 style={{ fontSize: 18, fontWeight: 500 }}>{ncr.title}</h2>
            {ncr.inspection_title && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                From inspection: <a href="#" onClick={e => { e.preventDefault(); navigate(`/inspections/${ncr.inspection_id}`); }} style={{ color: 'var(--blue)' }}>{ncr.inspection_title}</a>
              </div>
            )}
          </div>
          {!editing && (
            <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Severity</label>
                <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Assigned To</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                  <option value="">— Unassigned —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Root Cause</label>
              <textarea value={form.root_cause} onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))} placeholder="Identified root cause…" style={{ minHeight: 60 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ minHeight: 60 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>SEVERITY</div>
              <span className={`badge ${ncr.severity === 'critical' ? 'badge-red' : ncr.severity === 'major' ? 'badge-amber' : 'badge-gray'}`}>{ncr.severity}</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>STATUS</div>
              <span className={`badge ${ncr.status === 'open' ? 'badge-amber' : ncr.status === 'investigating' ? 'badge-blue' : ncr.status === 'resolved' ? 'badge-green' : 'badge-gray'}`}>{ncr.status}</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>ASSIGNED TO</div>
              <div style={{ fontSize: 13 }}>{ncr.assigned_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>DUE DATE</div>
              <div style={{ fontSize: 13, color: ncr.due_date && new Date(ncr.due_date) < new Date() ? 'var(--red)' : undefined }}>
                {ncr.due_date ? new Date(ncr.due_date).toLocaleDateString() : '—'}
              </div>
            </div>
            {ncr.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>DESCRIPTION</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{ncr.description}</div>
              </div>
            )}
            {ncr.root_cause && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>ROOT CAUSE</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{ncr.root_cause}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Corrective Actions */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-label">Corrective Actions</div>
          <button className="btn btn-sm" onClick={() => setShowActionModal(true)}>+ Add Action</button>
        </div>

        {ncr.corrective_actions?.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>No corrective actions added yet.</p>
        ) : (
          ncr.corrective_actions?.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, textDecoration: a.status === 'completed' ? 'line-through' : 'none', color: a.status === 'completed' ? 'var(--text3)' : undefined }}>
                  {a.description}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {a.assigned_name ? `Assigned to ${a.assigned_name}` : 'Unassigned'}
                  {a.due_date ? ` · Due ${new Date(a.due_date).toLocaleDateString()}` : ''}
                </div>
              </div>
              {a.status !== 'completed' ? (
                <button className="btn btn-sm" onClick={() => completeAction(a.id)} style={{ background: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green)', flexShrink: 0 }}>
                  Complete
                </button>
              ) : (
                <span className="badge badge-green">Done</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Action Modal */}
      {showActionModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowActionModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Add Corrective Action</h2>
              <button onClick={() => setShowActionModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={addAction}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Action *</label>
                <textarea value={actionForm.description} onChange={e => setActionForm(f => ({ ...f, description: e.target.value }))} required autoFocus placeholder="What needs to be done?" style={{ minHeight: 72 }} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Assign To</label>
                  <select value={actionForm.assigned_to} onChange={e => setActionForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">— Unassigned —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="date" value={actionForm.due_date} onChange={e => setActionForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowActionModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Action</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
