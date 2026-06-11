import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';

const BONES = [
  { key: 'methods',     label: 'Methods',     color: '#185FA5' },
  { key: 'machines',    label: 'Machines',    color: '#7c3aed' },
  { key: 'materials',   label: 'Materials',   color: '#dc2626' },
  { key: 'manpower',    label: 'Manpower',    color: '#d97706' },
  { key: 'measurement', label: 'Measurement', color: '#16a34a' },
  { key: 'environment', label: 'Environment', color: '#0891b2' },
];

function FishboneSVG({ effect, bones }) {
  const W = 800, H = 420;
  const CX = 680, CY = H / 2;
  const headW = 80, headH = 40;

  const boneLines = [
    { key: 'methods',     x1: 160, y1: 60,  x2: 380, y2: CY },
    { key: 'machines',    x1: 350, y1: 60,  x2: 490, y2: CY },
    { key: 'materials',   x1: 540, y1: 60,  x2: 590, y2: CY },
    { key: 'manpower',    x1: 160, y1: H - 60, x2: 380, y2: CY },
    { key: 'measurement', x1: 350, y1: H - 60, x2: 490, y2: CY },
    { key: 'environment', x1: 540, y1: H - 60, x2: 590, y2: CY },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', border: '1px solid #e5e5e0', borderRadius: 10, background: '#fff', marginBottom: 16 }}>
      {/* Spine */}
      <line x1={80} y1={CY} x2={CX - headW} y2={CY} stroke="#2a2a28" strokeWidth={2.5} />
      {/* Head (effect box) */}
      <rect x={CX - headW} y={CY - headH / 2} width={headW} height={headH} rx={6} fill="#185FA5" />
      <text x={CX - headW / 2} y={CY + 5} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="600"
        style={{ fontFamily: 'sans-serif' }}>
        {effect || 'Effect'}
      </text>

      {boneLines.map((b, i) => {
        const bone = BONES.find(x => x.key === b.key);
        const isTop = i < 3;
        const causes = bones[b.key] || [];
        return (
          <g key={b.key}>
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={bone.color} strokeWidth={1.5} />
            <text x={b.x1} y={isTop ? b.y1 - 8 : b.y1 + 16} textAnchor="middle" fontSize={11} fontWeight="600"
              fill={bone.color} style={{ fontFamily: 'sans-serif' }}>
              {bone.label}
            </text>
            {causes.slice(0, 4).map((cause, ci) => {
              const t = 0.35 + ci * 0.12;
              const mx = b.x1 + (b.x2 - b.x1) * t;
              const my = b.y1 + (b.y2 - b.y1) * t;
              const offset = isTop ? -18 : 18;
              return (
                <g key={ci}>
                  <line x1={mx} y1={my} x2={mx} y2={my + offset} stroke={bone.color} strokeWidth={1} strokeDasharray="3 2" />
                  <text x={mx} y={my + offset + (isTop ? -3 : 12)} textAnchor="middle" fontSize={9}
                    fill="#5a5a57" style={{ fontFamily: 'sans-serif' }}>
                    {cause.length > 14 ? cause.slice(0, 13) + '…' : cause}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export default function FishboneBuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState('');
  const [effect, setEffect] = useState('');
  const [bones, setBones] = useState(Object.fromEntries(BONES.map(b => [b.key, []])));
  const [newCause, setNewCause] = useState(Object.fromEntries(BONES.map(b => [b.key, ''])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  const ncrId = params.get('ncr_id');
  const capaId = params.get('capa_id');

  const addCause = (boneKey) => {
    const val = newCause[boneKey].trim();
    if (!val) return;
    setBones(prev => ({ ...prev, [boneKey]: [...prev[boneKey], val] }));
    setNewCause(prev => ({ ...prev, [boneKey]: '' }));
  };

  const removeCause = (boneKey, idx) => {
    setBones(prev => ({ ...prev, [boneKey]: prev[boneKey].filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    if (!title || !effect) { setError('Title and effect are required'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post('/api/quality-tools', {
        type: 'fishbone', title,
        data: { effect, bones },
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#5a5a57' }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Fishbone (Ishikawa) Diagram</h2>
      </div>

      {/* Title + Effect */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>Diagram Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Surface Scratch Root Cause"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#5a5a57', display: 'block', marginBottom: 4 }}>Effect (Problem Statement) *</label>
          <input value={effect} onChange={e => setEffect(e.target.value)} placeholder="e.g. Surface scratches on part"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Live SVG preview */}
      <FishboneSVG effect={effect} bones={bones} />

      {/* Cause entry */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
        {BONES.map(bone => (
          <div key={bone.key} style={{ border: `1px solid ${bone.color}30`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: bone.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {bone.label}
            </div>
            {bones[bone.key].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 12, color: '#2a2a28', background: '#f8f8f7', borderRadius: 6, padding: '3px 8px' }}>{c}</span>
                <button onClick={() => removeCause(bone.key, i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={newCause[bone.key]} onChange={e => setNewCause(prev => ({ ...prev, [bone.key]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addCause(bone.key)}
                placeholder="Add cause…"
                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #d4d4d0', fontSize: 12 }} />
              <button onClick={() => addCause(bone.key)}
                style={{ background: bone.color, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>+</button>
            </div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '8px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12 }}>Saved! (ID {saved.id})</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 20px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : '💾 Save Diagram'}
        </button>
        <button onClick={() => navigate('/quality-tools')}
          style={{ padding: '8px 16px', background: '#f0f0ee', color: '#5a5a57', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          Back to Tools
        </button>
      </div>
    </div>
  );
}
