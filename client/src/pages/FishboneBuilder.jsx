import React, { useState } from 'react';
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

// Word-wrap effect text into lines of ≤maxLen chars, respecting word boundaries
function wrapText(text, maxLen) {
  if (!text) return ['Effect'];
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length <= maxLen) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = w.slice(0, maxLen);
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function FishboneSVG({ effect, bones }) {
  // Wider canvas so the head box never clips
  const W = 980, H = 460;
  const CY = H / 2; // 230
  const SPINE_X0 = 50;
  const SPINE_X1 = 820; // spine ends here; head box starts
  const HEAD_W = 150, HEAD_H = 58;

  // 3 evenly-spaced attachment points along the spine
  const ATTACH = [230, 430, 630];

  // Each bone: start corner (lx, ly) → spine attachment (ax, CY)
  const boneConfig = [
    { key: 'methods',     color: '#185FA5', label: 'Methods',     top: true,  ax: ATTACH[0], lx: 55,  ly: 58  },
    { key: 'machines',    color: '#7c3aed', label: 'Machines',    top: true,  ax: ATTACH[1], lx: 280, ly: 58  },
    { key: 'materials',   color: '#dc2626', label: 'Materials',   top: true,  ax: ATTACH[2], lx: 510, ly: 58  },
    { key: 'manpower',    color: '#d97706', label: 'Manpower',    top: false, ax: ATTACH[0], lx: 55,  ly: H - 58 },
    { key: 'measurement', color: '#16a34a', label: 'Measurement', top: false, ax: ATTACH[1], lx: 280, ly: H - 58 },
    { key: 'environment', color: '#0891b2', label: 'Environment', top: false, ax: ATTACH[2], lx: 510, ly: H - 58 },
  ];

  const effectLines = wrapText(effect, 14);
  const lineH = 15;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', border: '1px solid #e5e5e0', borderRadius: 10, background: '#fafafa', marginBottom: 16, display: 'block' }}
    >
      {/* Spine */}
      <line x1={SPINE_X0} y1={CY} x2={SPINE_X1} y2={CY} stroke="#2a2a28" strokeWidth={2.5} />
      {/* Arrowhead */}
      <polygon points={`${SPINE_X1},${CY} ${SPINE_X1 - 14},${CY - 7} ${SPINE_X1 - 14},${CY + 7}`} fill="#2a2a28" />

      {/* Effect (head) box — wide enough for wrapped text */}
      <rect x={SPINE_X1} y={CY - HEAD_H / 2} width={HEAD_W} height={HEAD_H} rx={8} fill="#185FA5" />
      {effectLines.map((line, i) => {
        const totalH = effectLines.length * lineH;
        const startY = CY - totalH / 2 + lineH / 2;
        return (
          <text
            key={i}
            x={SPINE_X1 + HEAD_W / 2}
            y={startY + i * lineH}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={11}
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            {line}
          </text>
        );
      })}

      {/* Bones */}
      {boneConfig.map(({ key, color, label, top, ax, lx, ly }) => {
        const causes = (bones[key] || []).slice(0, 3);
        const dx = ax - lx;
        const dy = CY - ly; // negative for top bones (going downward to spine), positive for bottom

        return (
          <g key={key}>
            {/* Main diagonal bone */}
            <line x1={lx} y1={ly} x2={ax} y2={CY} stroke={color} strokeWidth={2} />

            {/* Category label — above bone tip for top, below for bottom */}
            <text
              x={lx}
              y={top ? ly - 10 : ly + 20}
              textAnchor="middle"
              fontSize={12}
              fontWeight="700"
              fill={color}
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>

            {/* Sub-causes: spaced at t=0.2, 0.5, 0.8 along the bone.
                Each cause gets a vertical tick + label above (top) or below (bottom).
                Because each t gives a different y on the angled bone, labels stack
                diagonally and never overlap each other. */}
            {causes.map((cause, ci) => {
              const t = 0.2 + ci * 0.3;
              const bx = lx + dx * t;
              const by = ly + dy * t;
              const TICK = 28; // length of the perpendicular tick line
              const ey = top ? by - TICK : by + TICK;
              const short = cause.length > 15 ? cause.slice(0, 14) + '…' : cause;
              return (
                <g key={ci}>
                  <line
                    x1={bx} y1={by} x2={bx} y2={ey}
                    stroke={color} strokeWidth={1} strokeDasharray="3 2"
                  />
                  <text
                    x={bx}
                    y={top ? ey - 4 : ey + 12}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="#3a3a38"
                    fontFamily="system-ui, sans-serif"
                  >
                    {short}
                  </text>
                </g>
              );
            })}

            {/* "+N more" badge if there are more than 3 causes */}
            {(bones[key] || []).length > 3 && (
              <text
                x={ax + (top ? -6 : -6)}
                y={top ? CY - 10 : CY + 18}
                textAnchor="middle"
                fontSize={8}
                fill={color}
                fontFamily="system-ui, sans-serif"
              >
                +{(bones[key] || []).length - 3} more
              </text>
            )}
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
