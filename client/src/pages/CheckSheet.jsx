import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

const EMPTY_ITEM = () => ({ id: Date.now() + Math.random(), label: '', counts: {} });

export default function CheckSheet() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState('');
  const [items, setItems] = useState([EMPTY_ITEM(), EMPTY_ITEM(), EMPTY_ITEM()]);
  const [periods, setPeriods] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [newPeriod, setNewPeriod] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  const ncrId = params.get('ncr_id');
  const capaId = params.get('capa_id');

  const addItem = () => setItems(prev => [...prev, EMPTY_ITEM()]);
  const removeItem = (id) => setItems(prev => prev.filter(x => x.id !== id));
  const updateLabel = (id, val) => setItems(prev => prev.map(x => x.id === id ? { ...x, label: val } : x));
  const updateCount = (id, period, val) => {
    const n = parseInt(val) || 0;
    setItems(prev => prev.map(x => x.id === id ? { ...x, counts: { ...x.counts, [period]: n } } : x));
  };
  const addPeriod = () => {
    const v = newPeriod.trim();
    if (!v || periods.includes(v)) return;
    setPeriods(prev => [...prev, v]);
    setNewPeriod('');
  };
  const removePeriod = (p) => setPeriods(prev => prev.filter(x => x !== p));

  const rowTotal = (item) => periods.reduce((s, p) => s + (item.counts[p] || 0), 0);
  const colTotal = (period) => items.reduce((s, item) => s + (item.counts[period] || 0), 0);
  const grandTotal = items.reduce((s, item) => s + rowTotal(item), 0);

  const save = async () => {
    if (!title) { setError('Title required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/api/quality-tools', {
        type: 'check_sheet', title,
        data: { periods, items: items.map(({ id, ...x }) => x) },
        ncr_id: ncrId ? Number(ncrId) : undefined,
        capa_id: capaId ? Number(capaId) : undefined,
      });
      setSaved(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const thStyle = { padding: '7px 10px', fontSize: 11, fontWeight: 600, color: '#5a5a57', background: '#f0f4f8', borderBottom: '2px solid #e5e5e0' };
  const tdStyle = { padding: '5px 8px', borderBottom: '1px solid #f0f0ee', textAlign: 'center' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Check Sheet</h2>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>Check Sheet Title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Surface Defect Tally — Week 24"
          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, width: 360 }} />
      </div>

      {/* Period (column) editor */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#5a5a57', marginBottom: 6, fontWeight: 500 }}>Columns (time periods / shifts / categories)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {periods.map(p => (
            <span key={p} style={{ background: '#E6F1FB', color: '#185FA5', borderRadius: 20, padding: '3px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              {p}
              <button onClick={() => removePeriod(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#185FA5', fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newPeriod} onChange={e => setNewPeriod(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPeriod()}
            placeholder="Add column…"
            style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d4d4d0', fontSize: 12, width: 140 }} />
          <button onClick={addPeriod} style={{ background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>+</button>
        </div>
      </div>

      {/* The tally table */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>Defect / Item</th>
              {periods.map(p => <th key={p} style={thStyle}>{p}</th>)}
              <th style={{ ...thStyle, color: '#185FA5' }}>Total</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id}>
                <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: 8 }}>
                  <input value={item.label} onChange={e => updateLabel(item.id, e.target.value)}
                    placeholder={`Item ${i + 1}`}
                    style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid #d4d4d0', fontSize: 12, width: 148 }} />
                </td>
                {periods.map(p => (
                  <td key={p} style={tdStyle}>
                    <input type="number" min={0} value={item.counts[p] || ''} onChange={e => updateCount(item.id, p, e.target.value)}
                      style={{ width: 52, padding: '3px 4px', textAlign: 'center', borderRadius: 5, border: '1px solid #d4d4d0', fontSize: 12 }} />
                  </td>
                ))}
                <td style={{ ...tdStyle, fontWeight: 700, color: '#185FA5' }}>{rowTotal(item)}</td>
                <td style={tdStyle}>
                  <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #e5e5e0' }}>
              <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: 8, fontWeight: 600, fontSize: 12, color: '#5a5a57' }}>Total</td>
              {periods.map(p => <td key={p} style={{ ...tdStyle, fontWeight: 600 }}>{colTotal(p)}</td>)}
              <td style={{ ...tdStyle, fontWeight: 700, color: '#185FA5', fontSize: 14 }}>{grandTotal}</td>
              <td style={tdStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button onClick={addItem} style={{ background: '#f0f0ee', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: '#5a5a57', marginBottom: 20 }}>
        + Add Row
      </button>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>Saved! (ID {saved.id})</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : '💾 Save Check Sheet'}
        </button>
        <button onClick={() => navigate('/quality-tools')}
          style={{ padding: '8px 16px', background: '#f0f0ee', color: '#5a5a57', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          Back to Tools
        </button>
      </div>
    </div>
  );
}
