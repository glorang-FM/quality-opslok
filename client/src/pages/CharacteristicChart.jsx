import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ComposedChart, LineChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../api';

const CAP_COLOR = v => v == null ? '#8a8a86' : v >= 1.67 ? '#16a34a' : v >= 1.33 ? '#2563eb' : v >= 1.0 ? '#d97706' : '#dc2626';

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background: '#f8f8f7', border: '1px solid #e5e5e0', borderRadius: 10, padding: '14px 16px', minWidth: 110 }}>
      <div style={{ fontSize: 11, color: '#8a8a86', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#1a1a18', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: '#8a8a86', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function CharacteristicChart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('imr'); // imr | hist | summary

  useEffect(() => {
    api.get(`/api/analytics/characteristic/${id}`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 32, color: '#8a8a86' }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: '#dc2626' }}>{error}</div>;
  if (!data) return null;

  const { characteristic: char, stats, controlChart, histogram } = data;

  const TABS = [
    { id: 'imr', label: 'I-MR Chart' },
    { id: 'hist', label: 'Histogram' },
    { id: 'summary', label: 'Capability Summary' },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{char.name}</h2>
          <div style={{ fontSize: 13, color: '#8a8a86', marginTop: 2 }}>
            {char.unit && <span style={{ marginRight: 8 }}>Unit: {char.unit}</span>}
            {char.nominal != null && <span style={{ marginRight: 8 }}>Nominal: {char.nominal}</span>}
            {char.usl != null && <span style={{ marginRight: 8 }}>USL: {char.usl}</span>}
            {char.lsl != null && <span>LSL: {char.lsl}</span>}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      {stats ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          <StatCard label="n" value={stats.n} />
          <StatCard label="Mean" value={Number(stats.mean).toFixed(4)} sub={char.unit} />
          <StatCard label="Std Dev (s)" value={Number(stats.std_dev).toFixed(4)} />
          <StatCard label="σ̂ (est)" value={Number(stats.sigma_est).toFixed(4)} />
          <StatCard label="Cp" value={stats.cp} color={CAP_COLOR(stats.cp)} />
          <StatCard label="Cpk" value={stats.cpk} color={CAP_COLOR(stats.cpk)} sub={stats.capability_class?.replace('_', ' ')} />
          <StatCard label="Pp" value={stats.pp} color={CAP_COLOR(stats.pp)} />
          <StatCard label="Ppk" value={stats.ppk} color={CAP_COLOR(stats.ppk)} />
          <StatCard label="Out of Spec" value={`${stats.out_of_spec} (${stats.out_of_spec_pct}%)`} color={stats.out_of_spec > 0 ? '#dc2626' : '#16a34a'} />
        </div>
      ) : (
        <div style={{ padding: '14px 18px', background: '#fef3c7', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#92400e' }}>
          Need at least 2 readings to compute statistics.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #e5e5e0' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? '#185FA5' : '#5a5a57',
            borderBottom: tab === t.id ? '2px solid #185FA5' : '2px solid transparent', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* I-MR Chart */}
      {tab === 'imr' && controlChart && (
        <div>
          {/* Individuals chart */}
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2a2a28' }}>Individuals Chart</div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={controlChart.points} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="idx" label={{ value: 'Sample', position: 'insideBottomRight', offset: -5, fontSize: 11 }} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v, n) => [typeof v === 'number' ? v.toFixed(4) : v, n]} />
              <ReferenceLine y={controlChart.ucl} stroke="#dc2626" strokeDasharray="5 3" label={{ value: `UCL: ${Number(controlChart.ucl).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              <ReferenceLine y={controlChart.xbar} stroke="#185FA5" strokeDasharray="4 2" label={{ value: `X̄: ${Number(controlChart.xbar).toFixed(4)}`, fill: '#185FA5', fontSize: 10, position: 'insideTopLeft' }} />
              <ReferenceLine y={controlChart.lcl} stroke="#dc2626" strokeDasharray="5 3" label={{ value: `LCL: ${Number(controlChart.lcl).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              {char.usl != null && <ReferenceLine y={Number(char.usl)} stroke="#f97316" strokeWidth={1.5} label={{ value: `USL`, fill: '#f97316', fontSize: 10 }} />}
              {char.lsl != null && <ReferenceLine y={Number(char.lsl)} stroke="#f97316" strokeWidth={1.5} label={{ value: `LSL`, fill: '#f97316', fontSize: 10 }} />}
              <Line type="linear" dataKey="val" stroke="#185FA5" strokeWidth={1.5} dot={p => (
                <circle key={p.key} cx={p.cx} cy={p.cy} r={4}
                  fill={p.payload.out_of_control ? '#dc2626' : '#185FA5'}
                  stroke={p.payload.out_of_control ? '#dc2626' : '#185FA5'} />
              )} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Moving Range chart */}
          <div style={{ marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#2a2a28' }}>Moving Range Chart</div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={controlChart.points.filter(p => p.mr != null)} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="idx" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip formatter={v => v?.toFixed(4)} />
              <ReferenceLine y={controlChart.ucl_mr} stroke="#dc2626" strokeDasharray="5 3" label={{ value: `UCL: ${Number(controlChart.ucl_mr).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              <ReferenceLine y={controlChart.mr_bar} stroke="#185FA5" strokeDasharray="4 2" label={{ value: `MR̄: ${Number(controlChart.mr_bar).toFixed(4)}`, fill: '#185FA5', fontSize: 10, position: 'insideTopLeft' }} />
              <Line type="linear" dataKey="mr" stroke="#7c3aed" strokeWidth={1.5} dot={{ r: 3, fill: '#7c3aed' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Histogram */}
      {tab === 'hist' && histogram && (
        <div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={histogram.bins} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="mid" tickFormatter={v => Number(v).toFixed(3)} label={{ value: char.unit || 'Value', position: 'insideBottom', offset: -10, fontSize: 12 }} tick={{ fontSize: 10 }} />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => [v, 'Count']} labelFormatter={v => `~${Number(v).toFixed(3)}`} />
              <Bar dataKey="count" fill="#185FA5" radius={[3, 3, 0, 0]} />
              {char.usl != null && <ReferenceLine x={Number(char.usl)} stroke="#f97316" strokeWidth={2} label={{ value: 'USL', fill: '#f97316', fontSize: 11 }} />}
              {char.lsl != null && <ReferenceLine x={Number(char.lsl)} stroke="#f97316" strokeWidth={2} label={{ value: 'LSL', fill: '#f97316', fontSize: 11 }} />}
              {stats && <ReferenceLine x={stats.mean} stroke="#185FA5" strokeDasharray="4 2" label={{ value: 'Mean', fill: '#185FA5', fontSize: 11, position: 'top' }} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Capability Summary */}
      {tab === 'summary' && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { label: 'Process Performance', items: [
              { k: 'Mean (X̄)', v: Number(stats.mean).toFixed(6) },
              { k: 'Std Dev (s)', v: Number(stats.std_dev).toFixed(6) },
              { k: 'σ̂ (from MR)', v: Number(stats.sigma_est).toFixed(6) },
              { k: 'Min', v: Number(stats.min).toFixed(6) },
              { k: 'Max', v: Number(stats.max).toFixed(6) },
              { k: 'Range', v: Number(stats.range).toFixed(6) },
            ]},
            { label: 'Specification', items: [
              { k: 'USL', v: stats.usl ?? '—' },
              { k: 'LSL', v: stats.lsl ?? '—' },
              { k: 'Nominal', v: stats.nominal ?? '—' },
              { k: 'Out of Spec', v: `${stats.out_of_spec} (${stats.out_of_spec_pct}%)` },
            ]},
            { label: 'Capability (short-term)', items: [
              { k: 'Cp', v: stats.cp ?? '—', color: CAP_COLOR(stats.cp) },
              { k: 'Cpk', v: stats.cpk ?? '—', color: CAP_COLOR(stats.cpk) },
              { k: 'Cpu', v: stats.cpu ?? '—' },
              { k: 'Cpl', v: stats.cpl ?? '—' },
              { k: 'Class', v: stats.capability_class?.replace('_', ' ') ?? '—', color: CAP_COLOR(stats.cpk) },
            ]},
            { label: 'Performance (long-term)', items: [
              { k: 'Pp', v: stats.pp ?? '—', color: CAP_COLOR(stats.pp) },
              { k: 'Ppk', v: stats.ppk ?? '—', color: CAP_COLOR(stats.ppk) },
            ]},
          ].map(section => (
            <div key={section.label} style={{ background: '#f8f8f7', border: '1px solid #e5e5e0', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5a5a57', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.label}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {section.items.map(item => (
                    <tr key={item.k}>
                      <td style={{ fontSize: 12, color: '#8a8a86', padding: '3px 0' }}>{item.k}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: item.color || '#1a1a18', textAlign: 'right', padding: '3px 0' }}>{item.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
