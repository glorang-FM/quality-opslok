import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

const SEV = ['1','2','3','4','5','6','7','8','9','10'];
const rpnColor = rpn => rpn >= 200 ? '#dc2626' : rpn >= 100 ? '#d97706' : rpn >= 50 ? '#2563eb' : '#16a34a';

const newRow = () => ({
  id: Date.now() + Math.random(),
  process_step: '',
  failure_mode: '',
  effect: '',
  severity: 1,
  cause: '',
  occurrence: 1,
  current_controls: '',
  detection: 1,
  action: '',
  owner: '',
  target_date: '',
  completed: false,
  new_sev: '',
  new_occ: '',
  new_det: '',
});

function RpnBadge({ rpn }) {
  return (
    <span style={{ background: rpnColor(rpn) + '20', color: rpnColor(rpn), fontWeight: 700, fontSize: 12, padding: '2px 7px', borderRadius: 6 }}>
      {rpn}
    </span>
  );
}

function NumSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ width: 48, padding: '3px 2px', borderRadius: 5, border: '1px solid #d4d4d0', fontSize: 12 }}>
      {SEV.map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}

export default function FMEABuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  const ncrId = params.get('ncr_id');
  const capaId = params.get('capa_id');

  const update = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, newRow()]);
  const removeRow = (id) => setRows(prev => prev.filter(r => r.id !== id));

  const save = async () => {
    if (!title) { setError('Title required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/api/quality-tools', {
        type: 'fmea', title,
        data: { rows: rows.map(({ id, ...r }) => r) },
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

  const cellStyle = { padding: '6px 4px', borderBottom: '1px solid #f0f0ee', verticalAlign: 'top' };
  const inputStyle = { width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid #d4d4d0', fontSize: 11, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>FMEA (Failure Mode & Effects Analysis)</h2>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>FMEA Title *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Assembly Process FMEA"
          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, width: 340 }} />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['RPN ≥ 200', '#dc2626'], ['100–199', '#d97706'], ['50–99', '#2563eb'], ['< 50', '#16a34a']].map(([lbl, clr]) => (
          <span key={lbl} style={{ fontSize: 11, color: clr, background: clr + '15', padding: '2px 8px', borderRadius: 10 }}>● {lbl}</span>
        ))}
        <span style={{ fontSize: 11, color: '#8a8a86' }}>S × O × D = RPN</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
          <thead>
            <tr style={{ background: '#f0f4f8', borderBottom: '2px solid #e5e5e0' }}>
              {['Process Step','Failure Mode','Effect of Failure','S','Potential Cause','O','Current Controls','D','RPN','Recommended Action','Owner','Target Date','Done','New S','New O','New D','New RPN',''].map((h, i) => (
                <th key={i} style={{ padding: '7px 6px', fontSize: 10, fontWeight: 600, color: '#5a5a57', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rpn = row.severity * row.occurrence * row.detection;
              const newRpn = (row.new_sev || row.severity) * (row.new_occ || row.occurrence) * (row.new_det || row.detection);
              return (
                <tr key={row.id} style={{ background: row.completed ? '#f0fdf4' : 'transparent' }}>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 100 }} value={row.process_step} onChange={e => update(row.id, 'process_step', e.target.value)} placeholder="Step…" /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 110 }} value={row.failure_mode} onChange={e => update(row.id, 'failure_mode', e.target.value)} placeholder="Mode…" /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 100 }} value={row.effect} onChange={e => update(row.id, 'effect', e.target.value)} placeholder="Effect…" /></td>
                  <td style={cellStyle}><NumSelect value={row.severity} onChange={v => update(row.id, 'severity', v)} /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 100 }} value={row.cause} onChange={e => update(row.id, 'cause', e.target.value)} placeholder="Cause…" /></td>
                  <td style={cellStyle}><NumSelect value={row.occurrence} onChange={v => update(row.id, 'occurrence', v)} /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 100 }} value={row.current_controls} onChange={e => update(row.id, 'current_controls', e.target.value)} placeholder="Controls…" /></td>
                  <td style={cellStyle}><NumSelect value={row.detection} onChange={v => update(row.id, 'detection', v)} /></td>
                  <td style={cellStyle}><RpnBadge rpn={rpn} /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 120 }} value={row.action} onChange={e => update(row.id, 'action', e.target.value)} placeholder="Action…" /></td>
                  <td style={cellStyle}><input style={{ ...inputStyle, minWidth: 80 }} value={row.owner} onChange={e => update(row.id, 'owner', e.target.value)} placeholder="Owner…" /></td>
                  <td style={cellStyle}><input type="date" style={{ ...inputStyle, minWidth: 100 }} value={row.target_date} onChange={e => update(row.id, 'target_date', e.target.value)} /></td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    <input type="checkbox" checked={row.completed} onChange={e => update(row.id, 'completed', e.target.checked)} />
                  </td>
                  <td style={cellStyle}><NumSelect value={row.new_sev || row.severity} onChange={v => update(row.id, 'new_sev', v)} /></td>
                  <td style={cellStyle}><NumSelect value={row.new_occ || row.occurrence} onChange={v => update(row.id, 'new_occ', v)} /></td>
                  <td style={cellStyle}><NumSelect value={row.new_det || row.detection} onChange={v => update(row.id, 'new_det', v)} /></td>
                  <td style={cellStyle}><RpnBadge rpn={newRpn} /></td>
                  <td style={cellStyle}>
                    <button onClick={() => removeRow(row.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={addRow} style={{ marginTop: 10, background: '#f0f0ee', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', color: '#5a5a57' }}>
        + Add Row
      </button>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 7, fontSize: 12, margin: '12px 0' }}>{error}</div>}
      {saved && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px 12px', borderRadius: 7, fontSize: 12, margin: '12px 0' }}>Saved! (ID {saved.id})</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : '💾 Save FMEA'}
        </button>
        <button onClick={() => navigate('/quality-tools')}
          style={{ padding: '8px 16px', background: '#f0f0ee', color: '#5a5a57', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          Back to Tools
        </button>
      </div>
    </div>
  );
}
