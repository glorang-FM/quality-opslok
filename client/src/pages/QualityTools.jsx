import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

const TOOL_DEFS = [
  {
    id: 'spc',
    label: 'SPC / Control Charts',
    icon: '📈',
    description: 'I-MR charts, Xbar-R charts, Cp/Cpk capability indices for variable characteristics.',
    color: '#185FA5',
    link: null, // dynamic — needs characteristic selection
    special: 'spc',
  },
  {
    id: 'pareto',
    label: 'Pareto Analysis',
    icon: '📊',
    description: 'Identify the vital few — NCR counts by defect type, part, or supplier.',
    color: '#7c3aed',
    link: '/quality-tools/pareto',
  },
  {
    id: 'scatter',
    label: 'Scatter Diagram',
    icon: '⚡',
    description: 'Correlation analysis between two measured characteristics.',
    color: '#0891b2',
    link: '/quality-tools/scatter',
  },
  {
    id: 'fishbone',
    label: 'Fishbone Diagram',
    icon: '🦴',
    description: 'Ishikawa cause-and-effect diagram with 6M categories. Save and link to NCRs.',
    color: '#dc2626',
    link: '/quality-tools/fishbone',
  },
  {
    id: 'fmea',
    label: 'FMEA',
    icon: '🔬',
    description: 'Failure Mode and Effects Analysis with auto-computed RPN, recommended actions.',
    color: '#d97706',
    link: '/quality-tools/fmea',
  },
  {
    id: 'check_sheet',
    label: 'Check Sheet',
    icon: '✔️',
    description: 'Structured tally sheet for defect counts by type and period/shift.',
    color: '#16a34a',
    link: '/quality-tools/check-sheet',
  },
  {
    id: 'gauge_rr',
    label: 'Gauge R&R',
    icon: '📏',
    description: 'Average & Range study per AIAG. Assess measurement system %GR&R and NDC.',
    color: '#2563eb',
    link: '/quality-tools/gauge-rr',
  },
];

const TYPE_LABELS = {
  fishbone: 'Fishbone',
  fmea: 'FMEA',
  check_sheet: 'Check Sheet',
  gauge_rr: 'Gauge R&R',
  flowchart: 'Flowchart',
};

const TYPE_ICONS = { fishbone: '🦴', fmea: '🔬', check_sheet: '✔️', gauge_rr: '📏', flowchart: '🗺️' };

function SPCSelector() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [charId, setCharId] = useState('');
  const [chartType, setChartType] = useState('imr');

  useEffect(() => {
    api.get('/api/control-plans').then(r => setPlans(r.data)).catch(console.error);
  }, []);

  const allChars = plans.flatMap(p =>
    (p.characteristics || [])
      .filter(c => c.char_type === 'variable')
      .map(c => ({ ...c, planLabel: `${p.part_number || ''} ${p.inspection_type}` }))
  );

  const go = () => {
    if (!charId) return;
    navigate(chartType === 'imr' ? `/quality-tools/chart/${charId}` : `/quality-tools/xbar-r/${charId}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select value={charId} onChange={e => setCharId(e.target.value)}
        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d4d4d0', fontSize: 12 }}>
        <option value="">Select characteristic…</option>
        {allChars.map(c => <option key={c.id} value={c.id}>{c.name} ({c.planLabel})</option>)}
      </select>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={chartType} onChange={e => setChartType(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d4d4d0', fontSize: 12, flex: 1 }}>
          <option value="imr">I-MR Chart + Cp/Cpk</option>
          <option value="xbar">X̄-R Chart</option>
        </select>
        <button onClick={go} disabled={!charId}
          style={{ padding: '5px 14px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Go →
        </button>
      </div>
    </div>
  );
}

export default function QualityTools() {
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/quality-tools')
      .then(r => setSaved(r.data))
      .catch(console.error)
      .finally(() => setLoadingSaved(false));
  }, []);

  const deleteTool = async (id) => {
    if (!window.confirm('Delete this saved tool?')) return;
    await api.delete(`/api/quality-tools/${id}`);
    setSaved(prev => prev.filter(x => x.id !== id));
  };

  const filtered = filter ? saved.filter(s => s.type === filter) : saved;

  const openSaved = (item) => {
    const routes = { fishbone: `/quality-tools/fishbone`, fmea: `/quality-tools/fmea`, check_sheet: `/quality-tools/check-sheet`, gauge_rr: `/quality-tools/gauge-rr` };
    navigate(`/quality-tools/view/${item.id}`);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>Quality Tools</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#8a8a86' }}>
          The 7 Basic Quality Tools + FMEA + Gauge R&R. Build diagrams, run SPC analysis, and save results linked to NCRs or CAPAs.
        </p>
      </div>

      {/* Tool cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 36 }}>
        {TOOL_DEFS.map(tool => (
          <div key={tool.id} style={{
            border: `1px solid ${tool.color}30`,
            borderRadius: 12,
            padding: 20,
            background: '#fff',
            display: 'flex', flexDirection: 'column', gap: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{tool.icon}</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: tool.color }}>{tool.label}</div>
            </div>
            <div style={{ fontSize: 12, color: '#5a5a57', lineHeight: 1.5 }}>{tool.description}</div>

            {tool.special === 'spc' ? (
              <SPCSelector />
            ) : (
              <Link to={tool.link} style={{
                display: 'inline-block',
                padding: '7px 16px', background: tool.color, color: '#fff', borderRadius: 8,
                fontSize: 12, fontWeight: 600, textDecoration: 'none', alignSelf: 'flex-start',
              }}>
                Open Tool →
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Saved tools */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Saved Tools</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {['', 'fishbone', 'fmea', 'check_sheet', 'gauge_rr'].map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding: '4px 12px', borderRadius: 20, border: '1px solid #d4d4d0',
                background: filter === t ? '#185FA5' : '#fff', color: filter === t ? '#fff' : '#5a5a57',
                fontSize: 11, cursor: 'pointer', fontWeight: filter === t ? 600 : 400,
              }}>
                {t ? TYPE_LABELS[t] : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loadingSaved ? (
          <div style={{ color: '#8a8a86', fontSize: 13, padding: 16 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '24px', background: '#f8f8f7', borderRadius: 10, color: '#8a8a86', fontSize: 13, textAlign: 'center' }}>
            No saved tools yet. Create one above.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filtered.map(item => (
              <div key={item.id} style={{ border: '1px solid #e5e5e0', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span>{TYPE_ICONS[item.type] || '🔧'}</span>
                      <span style={{ fontSize: 10, background: '#f0f0ee', color: '#5a5a57', padding: '2px 7px', borderRadius: 10 }}>{TYPE_LABELS[item.type] || item.type}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2a2a28', marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#b0afad' }}>
                      {item.created_by_name && <span>By {item.created_by_name} · </span>}
                      {new Date(item.updated_at).toLocaleDateString()}
                    </div>
                    {item.ncr_id && <div style={{ fontSize: 10, color: '#d97706', marginTop: 4 }}>Linked to NCR #{item.ncr_id}</div>}
                    {item.capa_id && <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>Linked to CAPA #{item.capa_id}</div>}
                  </div>
                  <button onClick={() => deleteTool(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14, flexShrink: 0, padding: 2 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
