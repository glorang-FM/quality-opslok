import React, { useState, useEffect } from 'react';
import api from '../api';

export default function SuperAdmin() {
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/superadmin/stats'),
      api.get('/api/superadmin/orgs'),
    ])
      .then(([r1, r2]) => { setStats(r1.data); setOrgs(r2.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const updatePaidThrough = async (orgId, currentValue) => {
    const val = prompt('Set paid_through date (YYYY-MM-DD), or leave blank to clear:', currentValue || '');
    if (val === null) return;
    try {
      await api.put(`/api/superadmin/orgs/${orgId}/paid-through`, { paid_through: val || null });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Admin Portal</h1>
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card"><div className="stat-label">Organizations</div><div className="stat-val">{stats.orgs}</div></div>
          <div className="stat-card"><div className="stat-label">Users</div><div className="stat-val">{stats.users}</div></div>
          <div className="stat-card"><div className="stat-label">Inspections</div><div className="stat-val">{stats.inspections}</div></div>
          <div className="stat-card"><div className="stat-label">NCRs</div><div className="stat-val">{stats.ncrs}</div></div>
        </div>
      )}

      <div className="section-label" style={{ marginBottom: 10 }}>All Organizations</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Org</th>
              <th>Users</th>
              <th>Inspections</th>
              <th>NCRs</th>
              <th>Plan</th>
              <th>Paid Through</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{o.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{o.slug}</div>
                </td>
                <td>{o.user_count}</td>
                <td>{o.inspection_count}</td>
                <td>{o.ncr_count}</td>
                <td>
                  <span className="badge badge-gray">{o.plan || 'trial'}</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {o.paid_through ? new Date(o.paid_through).toLocaleDateString() : '—'}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => updatePaidThrough(o.id, o.paid_through)}>
                    Set paid thru
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
