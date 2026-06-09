import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SEVERITY_BADGE = {
  critical: 'badge-red',
  major:    'badge-amber',
  minor:    'badge-gray',
};

const RESULT_BADGE = {
  passed: 'badge-green',
  failed: 'badge-red',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/dashboard')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>;
  if (!data) return null;

  const { stats, recent_inspections, open_ncrs } = data;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Inspections</div>
          <div className="stat-val">{stats.total_inspections}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pass Rate</div>
          <div className={`stat-val ${stats.pass_rate === null ? '' : stats.pass_rate >= 90 ? 'green' : stats.pass_rate >= 70 ? 'amber' : 'red'}`}>
            {stats.pass_rate !== null ? `${stats.pass_rate}%` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open NCRs</div>
          <div className={`stat-val ${stats.open_ncrs > 0 ? 'amber' : 'green'}`}>{stats.open_ncrs}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical NCRs</div>
          <div className={`stat-val ${stats.critical_ncrs > 0 ? 'red' : ''}`}>{stats.critical_ncrs}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Recent Inspections */}
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Recent Inspections</div>
          <div className="card" style={{ padding: 0 }}>
            {recent_inspections.length === 0 ? (
              <div className="empty-state"><p>No inspections yet.</p></div>
            ) : (
              <div className="table-wrap" style={{ border: 'none', borderRadius: 'var(--radius-lg)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Inspector</th>
                      <th>Result</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_inspections.map(i => (
                      <tr key={i.id} onClick={() => navigate(`/inspections/${i.id}`)}>
                        <td style={{ fontWeight: 500 }}>{i.title}</td>
                        <td style={{ color: 'var(--text2)' }}>{i.inspector_name || '—'}</td>
                        <td>
                          {i.result
                            ? <span className={`badge ${RESULT_BADGE[i.result] || 'badge-gray'}`}>{i.result}</span>
                            : <span className="badge badge-gray">{i.status}</span>
                          }
                        </td>
                        <td style={{ color: 'var(--text3)', fontSize: 12 }}>
                          {new Date(i.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Open NCRs */}
        <div>
          <div className="section-label" style={{ marginBottom: 8 }}>Open NCRs</div>
          <div className="card" style={{ padding: 0 }}>
            {open_ncrs.length === 0 ? (
              <div className="empty-state"><p>No open NCRs.</p></div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {open_ncrs.map(n => (
                  <div
                    key={n.id}
                    onClick={() => navigate(`/ncrs/${n.id}`)}
                    style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{n.title}</span>
                      <span className={`badge ${SEVERITY_BADGE[n.severity] || 'badge-gray'}`}>{n.severity}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {n.ncr_number} · {n.assigned_name ? `Assigned to ${n.assigned_name}` : 'Unassigned'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
