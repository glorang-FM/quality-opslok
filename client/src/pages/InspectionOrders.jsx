import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AQL_TABLE = [[2,2],[8,3],[15,5],[25,8],[50,13],[90,20],[150,32],[280,50],[500,80],[1200,125],[3200,200],[10000,315],[35000,500],[150000,800]];
function aqlSample(lot) {
  for (const [max, n] of AQL_TABLE) { if (lot <= max) return n; }
  return 1250;
}

const STATUS_BADGE = {
  open: 'badge-blue', in_progress: 'badge-amber', complete: 'badge-green',
  on_hold: 'badge-amber', cancelled: 'badge-gray'
};
const RESULT_BADGE = {
  pass: 'badge-green', fail: 'badge-red', conditional_pass: 'badge-amber'
};

export default function InspectionOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [parts, setParts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ part_id: '', inspection_type: 'incoming', lot_size: '', supplier_id: '', assigned_to: '' });

  const load = () => {
    setLoading(true);
    api.get('/api/inspection-orders')
      .then(r => setOrders(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = () => {
    Promise.all([
      api.get('/api/parts'),
      api.get('/api/suppliers'),
      api.get('/api/auth/users'),
    ]).then(([p, s, u]) => { setParts(p.data); setSuppliers(s.data); setUsers(u.data); });
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (payload.lot_size) payload.lot_size = parseInt(payload.lot_size);
      if (!payload.supplier_id) delete payload.supplier_id;
      if (!payload.assigned_to) delete payload.assigned_to;
      const { data } = await api.post('/api/inspection-orders', payload);
      setShowModal(false);
      navigate(`/inspection-orders/${data.id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Error creating order');
    }
  };

  const samplePreview = form.lot_size ? aqlSample(parseInt(form.lot_size)) : null;

  return (
    <div>
      <div className="page-header">
        <h1>Inspection Orders</h1>
        <button className="btn btn-primary" onClick={openModal}>+ New Order</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>
      ) : orders.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p style={{ color: 'var(--text2)' }}>No inspection orders yet. Create one to start measuring.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order #</th><th>Part</th><th>Type</th><th>Lot</th>
                <th>Sample</th><th>Status</th><th>Result</th><th>Assigned</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} onClick={() => navigate(`/inspection-orders/${o.id}`)}>
                  <td><strong>{o.order_number}</strong></td>
                  <td>{o.part_number} <span style={{ color: 'var(--text3)', fontSize: 11 }}>r{o.revision}</span></td>
                  <td><span className="badge badge-blue">{o.inspection_type}</span></td>
                  <td>{o.lot_size || '-'}</td>
                  <td>{o.sample_size || '-'}</td>
                  <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-gray'}`}>{o.status.replace(/_/g,' ')}</span></td>
                  <td>{o.result ? <span className={`badge ${RESULT_BADGE[o.result] || 'badge-gray'}`}>{o.result.replace(/_/g,' ')}</span> : '-'}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{o.assigned_name || '-'}</td>
                  <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); navigate(`/inspection-orders/${o.id}`); }}>
                    {o.status === 'complete' ? 'View' : 'Execute →'}
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>New Inspection Order</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa' }}>✕</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Part *</label>
                <select required value={form.part_id} onChange={e => setForm(f => ({ ...f, part_id: e.target.value }))}>
                  <option value="">Select part...</option>
                  {parts.map(p => <option key={p.id} value={p.id}>{p.part_number} r{p.revision}{p.description ? ` — ${p.description}` : ''}</option>)}
                </select>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Inspection Type</label>
                  <select value={form.inspection_type} onChange={e => setForm(f => ({ ...f, inspection_type: e.target.value }))}>
                    <option value="incoming">Incoming</option>
                    <option value="inprocess">In-Process</option>
                    <option value="preshipment">Pre-Shipment</option>
                    <option value="final">Final</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Lot Size</label>
                  <input type="number" placeholder="1000" value={form.lot_size}
                    onChange={e => setForm(f => ({ ...f, lot_size: e.target.value }))} />
                  {samplePreview && <span style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>AQL sample: {samplePreview} pcs</span>}
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Supplier</label>
                  <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                    <option value="">None</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Assign To</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">Me</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Order</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
