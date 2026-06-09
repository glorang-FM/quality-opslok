import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

export default function ControlPlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [chars, setChars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [gauges, setGauges] = useState([]);
  const [form, setForm] = useState({
    name: '', char_type: 'variable', nominal: '', lsl: '', usl: '', unit: '', gauge_id: '', critical: false
  });

  const load = () => {
    setLoading(true);
    api.get(`/api/control-plans/${id}`)
      .then(r => { setPlan(r.data); setChars(r.data.characteristics || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const openModal = () => {
    api.get('/api/gauges').then(r => setGauges(r.data));
    setForm({ name: '', char_type: 'variable', nominal: '', lsl: '', usl: '', unit: '', gauge_id: '', critical: false });
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (payload.nominal === '') payload.nominal = null; else payload.nominal = parseFloat(payload.nominal);
      if (payload.lsl === '') payload.lsl = null; else payload.lsl = parseFloat(payload.lsl);
      if (payload.usl === '') payload.usl = null; else payload.usl = parseFloat(payload.usl);
      if (!payload.gauge_id) payload.gauge_id = null;
      await api.post(`/api/control-plans/${id}/characteristics`, payload);
      setShowModal(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error adding characteristic');
    }
  };

  const deleteChar = async (charId) => {
    if (!confirm('Remove this characteristic?')) return;
    try {
      await api.delete(`/api/control-plans/${id}/characteristics/${charId}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>;
  if (!plan) return <div><p>Plan not found.</p></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => navigate('/control-plans')}>← Back</button>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>
          {plan.part_number} r{plan.revision} — {plan.inspection_type}
        </h1>
        <span className={`badge ${plan.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{plan.status}</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {chars.length} characteristic{chars.length !== 1 ? 's' : ''} · Created {new Date(plan.created_at).toLocaleDateString()}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={openModal}>+ Add Characteristic</button>
            {plan.status === 'draft' && (
              <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green-text)', borderColor: 'var(--green)' }}
                onClick={async () => {
                  if (!confirm('Approve? Existing active plan for this part/type will be superseded.')) return;
                  await api.post(`/api/control-plans/${id}/approve`);
                  load();
                }}>Approve Plan</button>
            )}
          </div>
        </div>
      </div>

      {chars.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📐</div>
          <p>No characteristics yet. Add them manually or <a href="/documents">upload a document</a> for AI extraction.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Characteristic</th><th>Type</th><th>Nominal</th><th>LSL</th><th>USL</th><th>Unit</th><th>Gauge</th><th>Critical</th><th>Source</th><th></th></tr>
            </thead>
            <tbody>
              {chars.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text3)', fontSize: 12 }}>{i + 1}</td>
                  <td><strong>{c.name}</strong>{c.description && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.description}</div>}</td>
                  <td><span className="badge badge-gray">{c.char_type}</span></td>
                  <td>{c.nominal != null ? c.nominal : '-'}</td>
                  <td style={{ color: c.lsl != null ? 'var(--blue-text)' : 'var(--text3)' }}>{c.lsl != null ? c.lsl : '-'}</td>
                  <td style={{ color: c.usl != null ? 'var(--blue-text)' : 'var(--text3)' }}>{c.usl != null ? c.usl : '-'}</td>
                  <td style={{ color: 'var(--text3)' }}>{c.unit || '-'}</td>
                  <td style={{ fontSize: 12 }}>{c.gauge_name || '-'}</td>
                  <td>{c.critical ? <span className="badge badge-red">Yes</span> : '-'}</td>
                  <td>{c.source_document_id ? <span className="badge badge-blue">AI</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>Manual</span>}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {plan.status !== 'active' && (
                      <button className="btn btn-sm" style={{ color: 'var(--red-text)' }} onClick={() => deleteChar(c.id)}>Remove</button>
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
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>Add Characteristic</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Name *</label>
                <input required placeholder="e.g. Outer Diameter" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.char_type} onChange={e => setForm(f => ({ ...f, char_type: e.target.value }))}>
                    <option value="variable">Variable (measured value)</option>
                    <option value="attribute">Attribute (pass/fail)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input placeholder="mm, in, °F, kg…" value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
              {form.char_type === 'variable' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label>Nominal</label>
                    <input type="number" step="0.0001" placeholder="25.400" value={form.nominal}
                      onChange={e => setForm(f => ({ ...f, nominal: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>LSL (Lower)</label>
                    <input type="number" step="0.0001" placeholder="25.350" value={form.lsl}
                      onChange={e => setForm(f => ({ ...f, lsl: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>USL (Upper)</label>
                    <input type="number" step="0.0001" placeholder="25.450" value={form.usl}
                      onChange={e => setForm(f => ({ ...f, usl: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label>Gauge (optional)</label>
                  <select value={form.gauge_id} onChange={e => setForm(f => ({ ...f, gauge_id: e.target.value }))}>
                    <option value="">None</option>
                    {gauges.map(g => <option key={g.id} value={g.id}>{g.name} {g.serial_number ? `#${g.serial_number}` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Critical characteristic?</label>
                  <select value={form.critical} onChange={e => setForm(f => ({ ...f, critical: e.target.value === 'true' }))}>
                    <option value="false">No</option>
                    <option value="true">Yes — Critical (CTQ)</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Characteristic</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
