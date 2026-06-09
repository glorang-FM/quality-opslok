import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

function computeInSpec(char, value) {
  if (char.char_type === 'attribute') return String(value).toLowerCase() === 'pass';
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  if (char.usl != null && v > parseFloat(char.usl)) return false;
  if (char.lsl != null && v < parseFloat(char.lsl)) return false;
  return true;
}

function ReadingCard({ char, sampleUnit, existingReading, onSave }) {
  const [value, setValue] = useState(existingReading?.actual_value ?? '');
  const [notes, setNotes] = useState(existingReading?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existingReading);

  const inSpec = value !== '' ? computeInSpec(char, value) : null;
  const deviation = value !== '' && char.nominal != null && char.char_type === 'variable'
    ? (parseFloat(value) - parseFloat(char.nominal))
    : null;

  const cardStyle = {
    border: `2px solid ${inSpec === true ? 'var(--green)' : inSpec === false ? 'var(--red)' : 'var(--border2)'}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    background: inSpec === true ? 'var(--green-bg)' : inSpec === false ? 'var(--red-bg)' : 'var(--surface)',
    transition: 'all 0.2s',
  };

  const handleSave = async () => {
    if (value === '') return alert('Enter a value first');
    if (inSpec === false && !notes.trim()) return alert('Notes are required for out-of-spec readings');
    setSaving(true);
    try {
      await onSave(char.id, value, notes, sampleUnit);
      setSaved(true);
    } catch (e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 15 }}>{char.name}</strong>
        {char.critical && <span className="badge badge-red" style={{ fontSize: 10 }}>CRITICAL</span>}
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{char.char_type}</span>
        {saved && <span className="badge badge-green" style={{ marginLeft: 'auto', fontSize: 10 }}>✓ Saved</span>}
      </div>

      {/* Spec display */}
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {char.nominal != null && <span>Nominal: <strong>{char.nominal} {char.unit || ''}</strong></span>}
        {char.lsl != null && <span>LSL: <strong>{char.lsl}</strong></span>}
        {char.usl != null && <span>USL: <strong>{char.usl}</strong></span>}
        {char.gauge_name && <span>Gauge: {char.gauge_name}</span>}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {char.char_type === 'attribute' ? (
          <select
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={saved}
            style={{ width: 160, fontSize: 15, fontWeight: 600, borderColor: inSpec === true ? 'var(--green)' : inSpec === false ? 'var(--red)' : undefined }}
          >
            <option value="">— Select —</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
        ) : (
          <input
            type="number"
            step="0.0001"
            placeholder="0.0000"
            value={value}
            disabled={saved}
            onChange={e => setValue(e.target.value)}
            style={{
              width: 140, fontSize: 20, fontWeight: 700, textAlign: 'center', padding: '8px 10px',
              border: `2px solid ${inSpec === true ? 'var(--green)' : inSpec === false ? 'var(--red)' : 'var(--border2)'}`,
              borderRadius: 6,
            }}
          />
        )}

        {inSpec !== null && (
          <div style={{
            fontWeight: 700, fontSize: 13, padding: '6px 14px', borderRadius: 20,
            background: inSpec ? 'var(--green-bg)' : 'var(--red-bg)',
            color: inSpec ? 'var(--green-text)' : 'var(--red-text)',
            border: `1px solid ${inSpec ? 'var(--green)' : 'var(--red)'}`,
          }}>
            {inSpec ? '✓ IN SPEC' : '✗ OUT OF SPEC'}
          </div>
        )}

        {deviation !== null && (
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            Dev: <strong style={{ color: Math.abs(deviation) > 0.001 ? 'var(--amber)' : 'var(--green)' }}>
              {deviation > 0 ? '+' : ''}{deviation.toFixed(4)} {char.unit || ''}
            </strong>
          </span>
        )}
      </div>

      {/* Notes — required when out of spec */}
      {(inSpec === false || notes) && (
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={saved}
          placeholder={inSpec === false ? 'Notes required — describe the finding...' : 'Optional notes'}
          style={{ marginTop: 10, width: '100%', minHeight: 60,
            borderColor: inSpec === false && !notes.trim() ? 'var(--red)' : undefined }}
        />
      )}

      {!saved && (
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 10 }}
          onClick={handleSave}
          disabled={saving || value === ''}
        >
          {saving ? 'Saving...' : 'Record Reading'}
        </button>
      )}
    </div>
  );
}

export default function InspectionExecute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sampleUnit, setSampleUnit] = useState(1);
  const [savedReadings, setSavedReadings] = useState({});
  const [completing, setCompleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/api/inspection-orders/${id}`)
      .then(r => {
        setData(r.data);
        // Index existing readings by charId_sample
        const idx = {};
        for (const reading of r.data.readings || []) {
          idx[`${reading.characteristic_id}_${reading.sample_number}`] = reading;
        }
        setSavedReadings(idx);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSaveReading = async (charId, value, notes, sample) => {
    const { data: result } = await api.post(`/api/inspection-orders/${id}/readings`, {
      characteristic_id: charId,
      sample_number: sample,
      actual_value: value,
      notes,
    });
    setSavedReadings(prev => ({
      ...prev,
      [`${charId}_${sample}`]: { actual_value: value, in_spec: result.in_spec, notes }
    }));
    return result;
  };

  const completeInspection = async () => {
    if (!confirm('Mark inspection complete? This will compute the final result.')) return;
    setCompleting(true);
    try {
      const { data: result } = await api.post(`/api/inspection-orders/${id}/complete`);
      alert(`Inspection complete — Result: ${result.result.replace(/_/g, ' ').toUpperCase()}`);
      navigate('/inspection-orders');
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setCompleting(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" /></div>;
  if (!data) return <div className="empty-state"><p>Order not found.</p></div>;

  const { order, characteristics } = data;
  const isComplete = order.status === 'complete';

  const totalReadings = characteristics.length;
  const completedReadings = characteristics.filter(c => savedReadings[`${c.id}_${sampleUnit}`]).length;
  const pct = totalReadings > 0 ? Math.round(completedReadings / totalReadings * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => navigate('/inspection-orders')}>← Back</button>
        <h1 style={{ fontSize: 18, fontWeight: 500 }}>{order.order_number}</h1>
        {isComplete && (
          <span className={`badge ${order.result === 'pass' ? 'badge-green' : order.result === 'fail' ? 'badge-red' : 'badge-amber'}`}>
            {order.result?.replace(/_/g, ' ').toUpperCase()}
          </span>
        )}
      </div>

      {/* Order info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <div><span style={{ color: 'var(--text2)' }}>Part:</span> <strong>{order.part_number} r{order.revision}</strong></div>
          <div><span style={{ color: 'var(--text2)' }}>Type:</span> <span className="badge badge-blue">{order.inspection_type}</span></div>
          {order.lot_size && <div><span style={{ color: 'var(--text2)' }}>Lot:</span> <strong>{order.lot_size}</strong></div>}
          {order.sample_size && <div><span style={{ color: 'var(--text2)' }}>Sample:</span> <strong>{order.sample_size} pcs</strong></div>}
          {order.supplier_name && <div><span style={{ color: 'var(--text2)' }}>Supplier:</span> <strong>{order.supplier_name}</strong></div>}
        </div>
      </div>

      {/* Progress + sample selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
              <span>Readings recorded</span>
              <span>{completedReadings} / {totalReadings} ({pct}%)</span>
            </div>
            <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </div>
          {!isComplete && order.sample_size > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>Sample unit:</label>
              <select
                value={sampleUnit}
                onChange={e => setSampleUnit(parseInt(e.target.value))}
                style={{ width: 80 }}
              >
                {Array.from({ length: order.sample_size || 1 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>#{i + 1}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>of {order.sample_size}</span>
            </div>
          )}
        </div>
      </div>

      {/* No control plan warning */}
      {!order.control_plan_id && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', color: 'var(--amber-text)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
          ⚠ No active control plan found for this part + inspection type. <a href="/control-plans" style={{ color: 'var(--amber-text)', fontWeight: 600 }}>Create one first</a> to use measurement-based inspection.
        </div>
      )}

      {/* Characteristics */}
      {characteristics.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
          <p>No characteristics on the control plan. <a href="/control-plans">Add characteristics</a> to start recording measurements.</p>
        </div>
      ) : (
        <>
          {characteristics.map(c => (
            <ReadingCard
              key={`${c.id}_${sampleUnit}`}
              char={c}
              sampleUnit={sampleUnit}
              existingReading={savedReadings[`${c.id}_${sampleUnit}`]}
              onSave={handleSaveReading}
            />
          ))}
          {!isComplete && (
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button className="btn" onClick={() => navigate('/inspection-orders')}>Save & Exit</button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 15, padding: '10px 24px' }}
                onClick={completeInspection}
                disabled={completing}
              >
                {completing ? 'Completing...' : 'Complete Inspection'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
