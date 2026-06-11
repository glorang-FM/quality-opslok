import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../api';

const VERDICT_COLOR = { 'Acceptable': '#16a34a', 'Marginal — conditionally acceptable': '#d97706', 'Unacceptable — measurement system needs improvement': '#dc2626' };

function pct(v) { return v != null ? `${Number(v).toFixed(1)}%` : '—'; }
function val(v) { return v != null ? Number(v).toFixed(5) : '—'; }

export default function GaugeRR() {
  const navigate = useNavigate();
  const [operators, setOperators] = useState(['Op 1', 'Op 2', 'Op 3']);
  const [parts, setParts] = useState(['P1', 'P2', 'P3', 'P4', 'P5']);
  const [replicates, setReplicates] = useState(2);
  const [measurements, setMeasurements] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const getMeas = (op, part, rep) => measurements[`${op}|${part}|${rep}`] ?? '';
  const setMeas = (op, part, rep, val) => setMeasurements(prev => ({ ...prev, [`${op}|${part}|${rep}`]: val }));

  const buildPayload = () => {
    const meas = [];
    for (const op of operators) {
      for (const part of parts) {
        for (let rep = 1; rep <= replicates; rep++) {
          const v = getMeas(op, part, rep);
          if (v !== '') meas.push({ operator: op, part, replicate: rep, value: parseFloat(v) });
        }
      }
    }
    return meas;
  };

  const runStudy = async () => {
    setLoading(true); setError(''); setResults(null);
    try {
      const res = await api.post('/api/analytics/gauge-rr', {
        measurements: buildPayload(),
        part_count: parts.length,
        operator_count: operators.length,
        replicates,
      });
      setResults(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const saveStudy = async () => {
    if (!title) { setError('Enter a title before saving'); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/quality-tools', {
        type: 'gauge_rr', title,
        data: { operators, parts, replicates, measurements, results: results?.results },
      });
      setSaved(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addListItem = (setter) => setter(prev => [...prev, `Item ${prev.length + 1}`]);
  const removeListItem = (setter, idx) => setter(prev => prev.filter((_, i) => i !== idx));
  const updateListItem = (setter, idx, val) => setter(prev => prev.map((x, i) => i === idx ? val : x));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Gauge R&R Study</h2>
          <div style={{ fontSize: 12, color: '#8a8a86', marginTop: 2 }}>Average & Range Method (AIAG)</div>
        </div>
      </div>

      {/* Config */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5a5a57', marginBottom: 8 }}>Operators</div>
          {operators.map((op, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input value={op} onChange={e => updateListItem(setOperators, i, e.target.value)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #d4d4d0', fontSize: 12 }} />
              <button onClick={() => removeListItem(setOperators, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13 }}>✕</button>
            </div>
          ))}
          <button onClick={() => addListItem(setOperators)} style={{ fontSize: 11, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>+ Add Operator</button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5a5a57', marginBottom: 8 }}>Parts</div>
          {parts.map((part, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input value={part} onChange={e => updateListItem(setParts, i, e.target.value)}
                style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid #d4d4d0', fontSize: 12 }} />
              <button onClick={() => removeListItem(setParts, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13 }}>✕</button>
            </div>
          ))}
          <button onClick={() => addListItem(setParts)} style={{ fontSize: 11, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>+ Add Part</button>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5a5a57', marginBottom: 8 }}>Replicates per operator/part</div>
          <input type="number" min={2} max={5} value={replicates} onChange={e => setReplicates(Math.max(2, parseInt(e.target.value) || 2))}
            style={{ width: 80, padding: '6px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13 }} />
        </div>
      </div>

      {/* Data entry matrix */}
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500 }}>
          <thead>
            <tr style={{ background: '#f0f4f8' }}>
              <th style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#5a5a57', textAlign: 'left', borderBottom: '2px solid #e5e5e0' }}>Operator / Part / Rep</th>
              {parts.map(p => (
                Array.from({ length: replicates }, (_, ri) => (
                  <th key={`${p}-r${ri+1}`} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#5a5a57', textAlign: 'center', borderBottom: '2px solid #e5e5e0' }}>
                    {p}<br /><span style={{ color: '#b0afad' }}>r{ri+1}</span>
                  </th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {operators.map(op => (
              <tr key={op} style={{ borderBottom: '1px solid #f0f0ee' }}>
                <td style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, color: '#2a2a28', whiteSpace: 'nowrap' }}>{op}</td>
                {parts.map(part => (
                  Array.from({ length: replicates }, (_, ri) => (
                    <td key={`${part}-r${ri+1}`} style={{ padding: '3px 4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        step="any"
                        value={getMeas(op, part, ri + 1)}
                        onChange={e => setMeas(op, part, ri + 1, e.target.value)}
                        style={{ width: 64, padding: '3px 4px', textAlign: 'center', borderRadius: 5, border: '1px solid #d4d4d0', fontSize: 12 }}
                      />
                    </td>
                  ))
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <button onClick={runStudy} disabled={loading}
        style={{ padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 24 }}>
        {loading ? 'Computing…' : '▶ Run Gauge R&R'}
      </button>

      {/* Results */}
      {results && (
        <div>
          <div style={{ background: VERDICT_COLOR[results.results.verdict] + '15', border: `1px solid ${VERDICT_COLOR[results.results.verdict]}30`, borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: VERDICT_COLOR[results.results.verdict] }}>
              {results.results.verdict}
            </div>
            <div style={{ fontSize: 12, color: '#5a5a57', marginTop: 4 }}>
              %GR&R = {pct(results.results.pct_grr)} &nbsp;|&nbsp; NDC = {results.results.ndc}
              {results.results.ndc >= 5 && <span style={{ color: '#16a34a', fontWeight: 600 }}> ✓ ≥5 distinct categories</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: '%GR&R', value: pct(results.results.pct_grr), color: VERDICT_COLOR[results.results.verdict] },
              { label: '%Repeatability', value: pct(results.results.pct_repeatability) },
              { label: '%Reproducibility', value: pct(results.results.pct_reproducibility) },
              { label: '%Part Variation', value: pct(results.results.pct_part_variation) },
              { label: 'NDC', value: results.results.ndc },
              { label: 'σ Repeatability', value: val(results.results.sigma_repeatability) },
              { label: 'σ Reproducibility', value: val(results.results.sigma_reproducibility) },
              { label: 'σ Total', value: val(results.results.sigma_total) },
            ].map(s => (
              <div key={s.label} style={{ background: '#f8f8f7', border: '1px solid #e5e5e0', borderRadius: 9, padding: '10px 14px', minWidth: 100 }}>
                <div style={{ fontSize: 10, color: '#8a8a86', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color || '#1a1a18' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Variance component chart */}
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Variance Components</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart layout="vertical" data={[
              { name: 'GR&R', value: results.results.pct_grr },
              { name: 'Repeatability', value: results.results.pct_repeatability },
              { name: 'Reproducibility', value: results.results.pct_reproducibility },
              { name: 'Part Variation', value: results.results.pct_part_variation },
            ]} margin={{ top: 5, right: 40, left: 90, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => v + '%'} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={85} />
              <Tooltip formatter={v => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {[results.results.pct_grr, results.results.pct_repeatability, results.results.pct_reproducibility, results.results.pct_part_variation].map((v, i) => (
                  <Cell key={i} fill={v >= 30 ? '#dc2626' : v >= 10 ? '#d97706' : '#16a34a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Save */}
          <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Study title for saving…"
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, width: 280 }} />
            <button onClick={saveStudy} disabled={saving}
              style={{ padding: '8px 18px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Saving…' : '💾 Save Study'}
            </button>
            {saved && <span style={{ fontSize: 12, color: '#16a34a' }}>Saved (ID {saved.id})</span>}
          </div>
        </div>
      )}
    </div>
  );
}
