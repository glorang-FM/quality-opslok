import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const BLANK_FORM = { name: '', description: '', category: '', items: [] };

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newItem, setNewItem] = useState('');
  const { user } = useAuth();

  const isManager = user?.role === 'manager';

  const load = () => {
    setLoading(true);
    api.get('/api/templates')
      .then(r => setTemplates(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(BLANK_FORM);
    setSelected(null);
    setShowModal(true);
    setError('');
  };

  const openEdit = (t) => {
    setForm({ name: t.name, description: t.description || '', category: t.category || '', items: t.items || [] });
    setSelected(t);
    setShowModal(true);
    setError('');
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    setForm(f => ({ ...f, items: [...f.items, { description: newItem.trim() }] }));
    setNewItem('');
  };

  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (selected) {
        await api.put(`/api/templates/${selected.id}`, form);
      } else {
        await api.post('/api/templates', form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/api/templates/${id}`);
      load();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Inspection Templates</h1>
        {isManager && <button className="btn btn-primary" onClick={openCreate}>+ New Template</button>}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>⊞</div>
          <p>No templates yet.{isManager ? ' Create a reusable checklist to speed up inspections.' : ''}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {templates.map(t => (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  {t.category && <span className="badge badge-blue" style={{ marginTop: 4 }}>{t.category}</span>}
                </div>
                {isManager && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(t)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                  </div>
                )}
              </div>
              {t.description && <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{t.description}</p>}
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                {t.items.length} checklist item{t.items.length !== 1 ? 's' : ''}
              </div>
              {t.items.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
                  {t.items.slice(0, 3).map((item, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '2px 0' }}>
                      {i + 1}. {item.description}
                    </div>
                  ))}
                  {t.items.length > 3 && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      +{t.items.length - 3} more items…
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>{selected ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-row">
                <div className="form-group">
                  <label>Template Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus placeholder="e.g. Incoming Material Check" />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Incoming, Process, Final" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="When to use this template…" style={{ minHeight: 56 }} />
              </div>

              <div className="section-label" style={{ marginBottom: 8 }}>Checklist Items</div>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', width: 18, flexShrink: 0 }}>{idx + 1}.</span>
                  <input
                    value={item.description}
                    onChange={e => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, description: e.target.value } : it) }))}
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, marginTop: 4 }}>
                <input
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                  placeholder="Add checklist item…"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-sm" onClick={addItem}>Add</button>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : (selected ? 'Save Changes' : 'Create Template')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
