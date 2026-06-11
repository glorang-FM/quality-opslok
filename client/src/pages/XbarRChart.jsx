import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import api from '../api';

export default function XbarRChart() {
  const { id } = useParams(); // characteristicId
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/analytics/xbar-r/${id}`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 32, color: '#8a8a86' }}>Loading…</div>;
  if (error) return <div style={{ padding: 32, color: '#dc2626' }}>{error}</div>;
  if (!data) return null;

  const { characteristic: char, subgroups, stats } = data;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>X̄-R Chart — {char.name}</h2>
          {stats && (
            <div style={{ fontSize: 12, color: '#8a8a86', marginTop: 3 }}>
              X̿: {Number(stats.x_double_bar).toFixed(4)} &nbsp;|&nbsp;
              R̄: {Number(stats.r_bar).toFixed(4)} &nbsp;|&nbsp;
              σ̂: {Number(stats.sigma_est).toFixed(4)} &nbsp;|&nbsp;
              Avg n: {stats.n_avg}
            </div>
          )}
        </div>
      </div>

      {!stats || subgroups.length < 2 ? (
        <div style={{ padding: '14px 18px', background: '#fef3c7', borderRadius: 10, color: '#92400e', fontSize: 13 }}>
          Need at least 2 inspection orders with multiple readings to render an X̄-R chart.
        </div>
      ) : (
        <>
          {/* Xbar Chart */}
          <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>X̄ (Subgroup Average) Chart</div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={subgroups} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="idx" label={{ value: 'Subgroup', position: 'insideBottomRight', offset: -5, fontSize: 11 }} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip formatter={v => v?.toFixed(4)} />
              <ReferenceLine y={stats.ucl_xbar} stroke="#dc2626" strokeDasharray="5 3"
                label={{ value: `UCL: ${Number(stats.ucl_xbar).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              <ReferenceLine y={stats.x_double_bar} stroke="#185FA5" strokeDasharray="4 2"
                label={{ value: `X̿: ${Number(stats.x_double_bar).toFixed(4)}`, fill: '#185FA5', fontSize: 10, position: 'insideTopLeft' }} />
              <ReferenceLine y={stats.lcl_xbar} stroke="#dc2626" strokeDasharray="5 3"
                label={{ value: `LCL: ${Number(stats.lcl_xbar).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              <Line type="linear" dataKey="xbar" stroke="#185FA5" strokeWidth={1.5}
                dot={(p) => <circle key={`xdot-${p.index}`} cx={p.cx} cy={p.cy} r={4}
                  fill={p.payload?.out_of_control_x ? '#dc2626' : '#185FA5'} stroke="none" />}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* R Chart */}
          <div style={{ marginTop: 20, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>R (Range) Chart</div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={subgroups} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
              <XAxis dataKey="idx" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip formatter={v => v?.toFixed(4)} />
              <ReferenceLine y={stats.ucl_r} stroke="#dc2626" strokeDasharray="5 3"
                label={{ value: `UCL: ${Number(stats.ucl_r).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              <ReferenceLine y={stats.r_bar} stroke="#185FA5" strokeDasharray="4 2"
                label={{ value: `R̄: ${Number(stats.r_bar).toFixed(4)}`, fill: '#185FA5', fontSize: 10, position: 'insideTopLeft' }} />
              {stats.lcl_r > 0 && (
                <ReferenceLine y={stats.lcl_r} stroke="#dc2626" strokeDasharray="5 3"
                  label={{ value: `LCL: ${Number(stats.lcl_r).toFixed(4)}`, fill: '#dc2626', fontSize: 10 }} />
              )}
              <Line type="linear" dataKey="r" stroke="#7c3aed" strokeWidth={1.5}
                dot={(p) => <circle key={`rdot-${p.index}`} cx={p.cx} cy={p.cy} r={4}
                  fill={p.payload?.out_of_control_r ? '#dc2626' : '#7c3aed'} stroke="none" />}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Constants used */}
          <div style={{ marginTop: 20, background: '#f8f8f7', border: '1px solid #e5e5e0', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#8a8a86', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Control chart constants (n={stats.n_avg})</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#5a5a57' }}>
              {Object.entries(stats.constants).map(([k, v]) => (
                <span key={k}><strong>{k}</strong> = {v}</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
