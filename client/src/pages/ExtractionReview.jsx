import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

function ExtractionItem({ item, onChange }) {
  const [state, setState] = useState(item.status || 'pending');
  const [nominal, setNominal] = useState(item.nominal ?? '');
  const [lsl, setLsl] = useState(item.lsl ?? '');
  const [usl, setUsl] = useState(item.usl ?? '');
  const [unit, setUnit] = useState(item.unit ?? '');

  useEffect(() => {
    onChange(item.id, { state, nominal, lsl, usl, unit });
  }, [state, nominal, lsl, usl, unit]);

  const confColor = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' }[item.ai_confidence] || 'var(--text3)';
  const confBg = { high: 'var(--green-bg)', medium: 'var(--amber-bg)', low: 'var(--red-bg)' }[item.ai_confidence] || 'var(--surface2)';

  return (
    <div style={{
      border: `1px solid ${state === 'approved' ? 'var(--green)' : state === 'rejected' ? 'var(--border2)' : 'var(--border2)'}`,
      borderRadius: 10, padding: 16, marginBottom: 10,
      background: state === 'approved' ? 'var(--green-bg)' : state === 'rejected' ? 'var(--surface2)' : 'var(--surface)',
      opacity: state === 'rejected' ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>{item.name}</strong>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: confBg, color: confColor }}>
          {item.ai_confidence} confidence
        </span>
        {item.critical && <span className="badge badge-red" style={{ fontSize: 10 }}>CRITICAL</span>}
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{item.char_type}</span>
        {item.gauge_type && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Gauge: {item.gauge_type}</span>}
      </div>
      {item.ai_notes && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, fontStyle: 'italic' }}>AI note: {item.ai_notes}</div>
      )}

      {item.char_type === 'variable' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          {[['Nominal', nominal, setNominal], ['LSL', lsl, setLsl], ['USL', usl, setUsl]].map(([label, val, set]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <input type="number" step="0.0001" placeholder="-" value={val}
                onChange={e => set(e.target.value)} disabled={state === 'rejected'}
                style={{ padding: '5px 8px', fontSize: 13 }} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>Unit</div>
            <input type="text" placeholder="mm…" value={unit}
              onChange={e => setUnit(e.target.value)} disabled={state === 'rejected'}
              style={{ padding: '5px 8px', fontSize: 13 }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className={`btn btn-sm ${state === 'approved' ? 'btn-primary' : ''}`}
          style={{ background: state === 'approved' ? 'var(--green)' : undefined, color: state === 'approved' ? '#fff' : undefined }}
          onClick={() => setState(state === 'approved' ? 'pending' : 'approved')}>
          {state === 'approved' ? '✓ Approved' : '✓ Approve'}
        </button>
        <button className="btn btn-sm"
          style={{ color: 'var(--red-text)', borderColor: state === 'rejected' ? 'var(--red)' : undefined }}
          onClick={() => setState(state === 'rejected' ? 'pending' : 'rejected')}>
          {state === 'rejected' ? 'Undo Reject' : '✗ Reject'}
        </button>
      </div>
    </div>
  );
}

export default function ExtractionReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [controlPlans, setControlPlans] = useState([]);
  const [targetCpId, setTargetCpId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemStates, setItemStates] = useState({});

  useEffect(() => {
    Promise.all([
      api.get(`/api/documents/${id}/extraction`),
      api.get('/api/control-plans'),
    ]).then(([ext, cps]) => {
      setData(ext.data);
      setControlPlans(cps.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const handleItemChange = (itemId, vals) => {
    setItemStates(prev => ({ ...prev, [itemId]: vals }));
  };

  const approveAll = () => {
    const highConf = data.items.filter(i => i.ai_confidence === 'high');
    setItemStates(prev => {
      const next = { ...prev };
      highConf.forEach(i => { next[i.id] = { ...(prev[i.id] || {}), state: 'approved' }; });
      return next;
    });
    // Force re-render by updating a dummy state (items will re-read from parent)
    window.dispatchEvent(new Event('approveAll'));
  };

  const save = async () => {
    if (!targetCpId) return alert('Select a target control plan first');
    const approved = data.items
      .filter(i => itemStates[i.id]?.state === 'approved')
      .map(i => ({
        item_id: i.id,
        nominal: itemStates[i.id]?.nominal !== '' ? parseFloat(itemStates[i.id]?.nominal) : null,
        lsl: itemStates[i.id]?.lsl !== '' ? parseFloat(itemStates[i.id]?.lsl) : null,
        usl: itemStates[i.id]?.usl !== '' ? parseFloat(itemStates[i.id]?.usl) : null,
        unit: itemStates[i.id]?.unit || null,
      }));
    if (!approved.length) return alert('No items approved. Click ✓ Approve on items to include.');
    setSaving(true);
    try {
      const { data: result } = await api.post(`/api/documents/${id}/extraction/approve`, {
        control_plan_id: parseInt(targetCpId),
        items: approved,
      });
      alert(`${result.created_count} characteristics added to control plan!`);
      navigate(`/control-plans/${targetCpId}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>;
  if (!data) return <div><p>Extraction not found.</p></div>;

  const { document: doc, extraction, items } = data;
  const approvedCount = items.filter(i => itemStates[i.id]?.state === 'approved').length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => navigate('/documents')}>← Back</button>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>AI Extraction Review</h1>
      </div>

      {/* Header info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          <div><span style={{ color: 'var(--text2)' }}>Document:</span> <strong>{doc.filename}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Items found:</span> <strong>{items.length}</strong></div>
          {extraction.raw_ai_output?.part_number && <div><span style={{ color: 'var(--text2)' }}>AI detected part:</span> <strong>{extraction.raw_ai_output.part_number}</strong></div>}
          {extraction.raw_ai_output?.document_type && <div><span style={{ color: 'var(--text2)' }}>Doc type:</span> <strong>{extraction.raw_ai_output.document_type}</strong></div>}
        </div>
        {extraction.raw_ai_output?.extraction_notes && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
            AI notes: {extraction.raw_ai_output.extraction_notes}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <select value={targetCpId} onChange={e => setTargetCpId(e.target.value)} style={{ maxWidth: 340 }}>
            <option value="">Select target control plan…</option>
            {controlPlans.map(cp => (
              <option key={cp.id} value={cp.id}>{cp.part_number} r{cp.revision} — {cp.inspection_type}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-sm" onClick={approveAll}>✓ Approve All High-Confidence</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !approvedCount}>
          {saving ? 'Saving…' : `Save ${approvedCount} Approved`}
        </button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
          <p>No characteristics were extracted. The document may not contain inspection data.</p>
        </div>
      ) : (
        items.map(item => (
          <ExtractionItem
            key={item.id}
            item={{ ...item, status: itemStates[item.id]?.state || 'pending' }}
            onChange={handleItemChange}
          />
        ))
      )}
    </div>
  );
}
