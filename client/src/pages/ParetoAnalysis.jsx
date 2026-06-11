import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import api from '../api';

const DAYS_OPTIONS = [30, 60, 90, 180, 365];

export default function ParetoAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [view, setView] = useState('by_defect'); // by_defect | by_part | by_supplier

  const load = (d) => {
    setLoading(true);
    api.get(`/api/analytics/pareto?days=${d}`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(days); }, [days]);

  const viewData = data?.[view] || [];
  const chartData = viewData.map((r, i) => ({
    ...r,
    name: r.title || r.part_number || r.supplier_name || `Item ${i + 1}`,
    cumulative_pct: r.cumulative_pct || null,
  }));

  // Add cumulative if not already present (by_part / by_supplier don't have it from server)
  if (view !== 'by_defect' && chartData.length) {
    const total = chartData.reduce((s, r) => s + r.count, 0);
    let cum = 0;
    chartData.forEach(r => { cum += r.count; r.cumulative_pct = parseFloat((cum / total * 100).toFixed(1)); });
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Pareto Analysis</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#5a5a57' }}>Period:</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13 }}>
            {DAYS_OPTIONS.map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
      </div>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[
          { id: 'by_defect', label: 'By Defect Type' },
          { id: 'by_part', label: 'By Part' },
          { id: 'by_supplier', label: 'By Supplier' },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 14px', borderRadius: 7, border: '1px solid #d4d4d0', cursor: 'pointer', fontSize: 13,
            background: view === v.id ? '#185FA5' : '#fff', color: view === v.id ? '#fff' : '#5a5a57', fontWeight: view === v.id ? 600 : 400,
          }}>{v.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#8a8a86', padding: 32 }}>Loading…</div>
      ) : chartData.length === 0 ? (
        <div style={{ padding: '24px', background: '#f8f8f7', borderRadius: 10, color: '#8a8a86', fontSize: 13, textAlign: 'center' }}>
          No NCR data in the last {days} days.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 6, fontSize: 12, color: '#5a5a57' }}>
            Total NCRs: <strong>{data?.total || chartData.reduce((s, r) => s + r.count, 0)}</strong>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 40, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]}
                label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine yAxisId="right" y={80} stroke="#f97316" strokeDasharray="4 2"
                label={{ value: '80%', fill: '#f97316', fontSize: 10, position: 'insideTopRight' }} />
              <Bar yAxisId="left" dataKey="count" name="NCR Count" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.cumulative_pct <= 80 ? '#185FA5' : '#93c5fd'} />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="cumulative_pct" stroke="#dc2626"
                strokeWidth={2} dot={{ r: 3, fill: '#dc2626' }} name="Cumulative %" />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Data table */}
          <div style={{ marginTop: 24, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f8f7' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e5e5e0', fontSize: 11, color: '#8a8a86', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e5e0', fontSize: 11, color: '#8a8a86', fontWeight: 600 }}>Count</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e5e5e0', fontSize: 11, color: '#8a8a86', fontWeight: 600 }}>Cumulative %</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '0.5px solid #f0f0ee' }}>
                    <td style={{ padding: '7px 12px', color: '#2a2a28' }}>{row.name}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: row.cumulative_pct <= 80 ? '#185FA5' : '#8a8a86' }}>
                      {row.cumulative_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
