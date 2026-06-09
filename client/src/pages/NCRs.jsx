import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SEV_BADGE = { critical: 'badge-red', major: 'badge-amber', minor: 'badge-gray' };
const STATUS_BADGE = { open: 'badge-amber', investigating: 'badge-blue', resolved: 'badge-green', closed: 'badge-gray' };

export default function NCRs() {
  const [ncrs, setNcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.append('status', statusFilter);
    if (sevFilter)    params.append('severity', sevFilter);
    api.get(`/api/ncrs?${params}`)
      .then(r => setNcrs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, sevFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Non-Conformance Reports</h1>
        <button className="btn btn-primary" onClick={() => navigate('/ncrs/new')}>+ New NCR</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['', 'open', 'investigating', 'resolved', 'closed'].map(s => (
            <button key={s} className="btn btn-sm"
              style={{ background: statusFilter === s ? 'var(--blue)' : undefined, color: statusFilter === s ? '#fff' : undefined, borderColor: statusFilter === s ? 'var(--blue)' : undefined }}
              onClick={() => setStatusFilter(s)}>
              {s || 'All status'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['', 'critical', 'major', 'minor'].map(s => (
            <button key={s} className="btn btn-sm"
              style={{ background: sevFilter === s && s ? (s === 'critical' ? 'var(--red)' : s === 'major' ? 'var(--amber)' : 'var(--text2)') : undefined, color: sevFilter === s && s ? '#fff' : undefined }}
              onClick={() => setSevFilter(s)}>
              {s || 'All severity'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>
      ) : ncrs.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>◎</div>
          <p>No NCRs found.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NCR #</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ncrs.map(n => (
                <tr key={n.id} onClick={() => navigate(`/ncrs/${n.id}`)}>
                  <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace' }}>{n.ncr_number}</td>
                  <td style={{ fontWeight: 500 }}>
                    {n.title}
                    {n.inspection_title && <div style={{ fontSize: 11, color: 'var(--text3)' }}>From: {n.inspection_title}</div>}
                  </td>
                  <td><span className={`badge ${SEV_BADGE[n.severity] || 'badge-gray'}`}>{n.severity}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[n.status] || 'badge-gray'}`}>{n.status}</span></td>
                  <td style={{ color: 'var(--text2)' }}>{n.assigned_name || '—'}</td>
                  <td style={{ color: n.due_date && new Date(n.due_date) < new Date() ? 'var(--red)' : 'var(--text2)', fontSize: 12 }}>
                    {n.due_date ? new Date(n.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ color: 'var(--text2)' }}>
                    {n.action_count > 0
                      ? `${n.actions_completed}/${n.action_count} done`
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
