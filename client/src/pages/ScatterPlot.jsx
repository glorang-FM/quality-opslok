import React, { useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label,
} from 'recharts';
import api from '../api';

export default function ScatterPlot() {
  const [chars, setChars] = useState([]);
  const [xId, setXId] = useState('');
  const [yId, setYId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load all control plans + characteristics for dropdowns
    api.get('/api/control-plans').then(r => {
      const allChars = [];
      for (const plan of r.data) {
        if (plan.characteristics) {
          for (const c of plan.characteristics) {
            if (c.char_type === 'variable') {
              allChars.push({ ...c, planLabel: `${plan.part_number || ''} ${plan.inspection_type}` });
            }
          }
        }
      }
      setChars(allChars);
    }).catch(console.error);
  }, []);

  const run = () => {
    if (!xId || !yId) return;
    setLoading(true); setError(''); setData(null);
    api.get(`/api/analytics/scatter?x=${xId}&y=${yId}`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const corrLabel = r => r == null ? '—' : Math.abs(r) >= 0.8 ? `Strong (${r})` : Math.abs(r) >= 0.5 ? `Moderate (${r})` : `Weak (${r})`;
  const corrColor = r => r == null ? '#8a8a86' : Math.abs(r) >= 0.8 ? '#16a34a' : Math.abs(r) >= 0.5 ? '#d97706' : '#8a8a86';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Scatter Diagram</h2>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>X Characteristic</label>
          <select value={xId} onChange={e => setXId(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, minWidth: 200 }}>
            <option value="">Select…</option>
            {chars.map(c => <option key={c.id} value={c.id}>{c.name} ({c.planLabel})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>Y Characteristic</label>
          <select value={yId} onChange={e => setYId(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, minWidth: 200 }}>
            <option value="">Select…</option>
            {chars.filter(c => String(c.id) !== xId).map(c => <option key={c.id} value={c.id}>{c.name} ({c.planLabel})</option>)}
          </select>
        </div>
        <button onClick={run} disabled={!xId || !yId || loading}
          style={{ padding: '8px 18px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', height: 36 }}>
          {loading ? 'Loading…' : 'Plot'}
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {data && (
        <>
          {/* Correlation badge */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#5a5a57' }}>
              n = <strong>{data.n}</strong>
            </div>
            <div style={{ fontSize: 13 }}>
              Pearson r: <strong style={{ color: corrColor(data.correlation) }}>{corrLabel(data.correlation)}</strong>
            </div>
          </div>

          {data.n === 0 ? (
            <div style={{ padding: 24, background: '#f8f8f7', borderRadius: 10, color: '#8a8a86', fontSize: 13, textAlign: 'center' }}>
              No matched readings found for these two characteristics in the same inspection orders.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
                <XAxis type="number" dataKey="x" name={data.char_x?.name} domain={['auto', 'auto']} tick={{ fontSize: 11 }}>
                  <Label value={`${data.char_x?.name}${data.char_x?.unit ? ` (${data.char_x.unit})` : ''}`} position="bottom" offset={20} style={{ fontSize: 12, fill: '#5a5a57' }} />
                </XAxis>
                <YAxis type="number" dataKey="y" name={data.char_y?.name} domain={['auto', 'auto']} tick={{ fontSize: 11 }}>
                  <Label value={`${data.char_y?.name}${data.char_y?.unit ? ` (${data.char_y.unit})` : ''}`} angle={-90} position="insideLeft" style={{ fontSize: 12, fill: '#5a5a57' }} />
                </YAxis>
                <Tooltip cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div style={{ background: '#fff', border: '1px solid #e5e5e0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                        <div>{data.char_x?.name}: <strong>{d?.x}</strong></div>
                        <div>{data.char_y?.name}: <strong>{d?.y}</strong></div>
                        {d?.order && <div style={{ color: '#8a8a86', marginTop: 4 }}>{d.order} · #{d.sample}</div>}
                      </div>
                    );
                  }}
                />
                <Scatter data={data.pairs} fill="#185FA5" opacity={0.75} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      {!data && !loading && (
        <div style={{ padding: 48, background: '#f8f8f7', borderRadius: 12, color: '#8a8a86', fontSize: 13, textAlign: 'center' }}>
          Select two variable characteristics from the same inspection orders and click Plot.
        </div>
      )}
    </div>
  );
}
