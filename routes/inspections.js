/**
 * Inspection Orders + Readings Routes
 */
const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// AQL 1.0 sample size lookup
function getAQLSampleSize(lotSize) {
  if (lotSize <= 8)    return { sampleSize: 2,   ac: 0, re: 1 };
  if (lotSize <= 15)   return { sampleSize: 3,   ac: 0, re: 1 };
  if (lotSize <= 25)   return { sampleSize: 5,   ac: 0, re: 1 };
  if (lotSize <= 50)   return { sampleSize: 8,   ac: 0, re: 1 };
  if (lotSize <= 90)   return { sampleSize: 13,  ac: 1, re: 2 };
  if (lotSize <= 150)  return { sampleSize: 20,  ac: 1, re: 2 };
  if (lotSize <= 280)  return { sampleSize: 32,  ac: 2, re: 3 };
  if (lotSize <= 500)  return { sampleSize: 50,  ac: 3, re: 4 };
  if (lotSize <= 1200) return { sampleSize: 80,  ac: 5, re: 6 };
  if (lotSize <= 3200) return { sampleSize: 125, ac: 7, re: 8 };
  return { sampleSize: 200, ac: 10, re: 11 };
}

// Generate inspection order number
async function nextOrderNumber(orgId) {
  const year = new Date().getFullYear();
  const { count } = await supabase.from('inspection_orders')
    .select('*', { count: 'exact', head: true }).eq('org_id', orgId);
  return `INS-${year}-${String((count || 0) + 1).padStart(4, '0')}`;
}

// GET /api/inspections — list with filters
router.get('/', requireAuth, async (req, res) => {
  const { status, type, assigned_to, part_id, limit = 50, offset = 0 } = req.query;
  let query = supabase.from('inspection_orders')
    .select(`*, parts(part_number,description), suppliers(name),
      users!assigned_to(name), control_plans(id,inspection_type)`)
    .eq('org_id', req.user.org_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status)      query = query.eq('status', status);
  if (type)        query = query.eq('inspection_type', type);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);
  if (part_id)     query = query.eq('part_id', part_id);
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ inspections: data, count });
});

// GET /api/inspections/my — items assigned to current user
router.get('/my', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('inspection_orders')
    .select(`*, parts(part_number,description), suppliers(name)`)
    .eq('org_id', req.user.org_id)
    .eq('assigned_to', req.user.id)
    .in('status', ['open','in_progress'])
    .order('date_required', { ascending: true, nullsFirst: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/inspections/:id — full detail with characteristics
router.get('/:id', requireAuth, async (req, res) => {
  const { data: order, error } = await supabase.from('inspection_orders')
    .select(`*, parts(part_number,description,revision),
      suppliers(name,contact_name),
      users!assigned_to(name,email),
      control_plans(id,inspection_type,revision,
        characteristics(id,sequence,name,nominal,usl,lsl,unit,gauge_type,critical,char_type,
          gauges(id,name,serial_number,status)))`)
    .eq('id', req.params.id)
    .eq('org_id', req.user.org_id)
    .single();
  if (error) return res.status(404).json({ error: 'Inspection not found' });

  // Get existing readings for this order
  const { data: readings } = await supabase.from('readings')
    .select('*, users!technician_id(name)')
    .eq('inspection_order_id', req.params.id)
    .order('sample_number').order('characteristic_id');

  // Get related NCRs
  const { data: ncrs } = await supabase.from('ncrs')
    .select('id,ncr_number,title,severity,status')
    .eq('inspection_order_id', req.params.id);

  res.json({ ...order, readings: readings || [], ncrs: ncrs || [] });
});

// POST /api/inspections — create new inspection order
router.post('/', requireAuth, async (req, res) => {
  const {
    part_id, control_plan_id, supplier_id, inspection_type,
    po_number, work_order, lot_number, lot_size, date_received,
    date_required, assigned_to, notes, team_id
  } = req.body;

  if (!part_id || !inspection_type)
    return res.status(400).json({ error: 'part_id and inspection_type required' });

  try {
    const order_number = await nextOrderNumber(req.user.org_id);
    const aql = lot_size ? getAQLSampleSize(parseInt(lot_size)) : null;

    const { data, error } = await supabase.from('inspection_orders').insert({
      org_id: req.user.org_id,
      team_id: team_id || null,
      part_id, control_plan_id: control_plan_id || null,
      supplier_id: supplier_id || null,
      inspection_type, order_number, po_number, work_order, lot_number,
      lot_size: lot_size ? parseInt(lot_size) : null,
      sample_size: aql?.sampleSize || null,
      date_received, date_required, notes,
      assigned_to: assigned_to || req.user.id,
      created_by: req.user.id,
      status: 'open'
    }).select().single();
    if (error) throw new Error(error.message);

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inspections/:id — update header info
router.put('/:id', requireAuth, async (req, res) => {
  const allowed = ['status','assigned_to','notes','date_required','lot_size','sample_size','po_number','work_order','lot_number'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];

  const { data, error } = await supabase.from('inspection_orders')
    .update(updates).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ============================================================
// READINGS
// ============================================================

// POST /api/inspections/:id/readings — submit measurement readings
// Body: { readings: [{ characteristic_id, sample_number, actual_value, attribute_result, gauge_id, notes }] }
router.post('/:id/readings', requireAuth, async (req, res) => {
  const { readings } = req.body;
  if (!readings?.length) return res.status(400).json({ error: 'readings array required' });

  try {
    // Get characteristics for spec limits
    const charIds = [...new Set(readings.map(r => r.characteristic_id))];
    const { data: chars } = await supabase.from('characteristics')
      .select('id,nominal,usl,lsl,char_type').in('id', charIds);
    const charMap = Object.fromEntries(chars.map(c => [c.id, c]));

    const rows = readings.map(r => {
      const char = charMap[r.characteristic_id];
      let in_spec = null;
      let deviation = null;

      if (char?.char_type === 'variable' && r.actual_value != null) {
        const val = parseFloat(r.actual_value);
        in_spec = (char.usl == null || val <= char.usl) && (char.lsl == null || val >= char.lsl);
        deviation = char.nominal != null ? parseFloat((val - char.nominal).toFixed(6)) : null;
      } else if (char?.char_type === 'attribute') {
        in_spec = r.attribute_result === 'pass';
      }

      return {
        inspection_order_id: req.params.id,
        characteristic_id: r.characteristic_id,
        org_id: req.user.org_id,
        technician_id: req.user.id,
        gauge_id: r.gauge_id || null,
        sample_number: r.sample_number || 1,
        actual_value: r.actual_value != null ? parseFloat(r.actual_value) : null,
        attribute_result: r.attribute_result || null,
        in_spec,
        deviation,
        notes: r.notes || null
      };
    });

    const { data: created, error } = await supabase.from('readings').insert(rows).select();
    if (error) throw new Error(error.message);

    // Auto-generate NCRs for out-of-spec readings if org setting enabled
    const { data: org } = await supabase.from('organizations')
      .select('settings').eq('id', req.user.org_id).single();
    const autoNCR = org?.settings?.auto_ncr_on_fail !== false;

    const outOfSpec = created.filter(r => r.in_spec === false);
    const ncrIds = [];

    if (autoNCR && outOfSpec.length > 0) {
      // Get inspection + part info for NCR title
      const { data: order } = await supabase.from('inspection_orders')
        .select('part_id, supplier_id, order_number, parts(part_number,description)')
        .eq('id', req.params.id).single();

      // Get NCR count for numbering
      const { count: ncrCount } = await supabase.from('ncrs')
        .select('*', { count: 'exact', head: true }).eq('org_id', req.user.org_id);

      // Group by characteristic to avoid duplicate NCRs per characteristic
      const byChar = {};
      for (const r of outOfSpec) {
        if (!byChar[r.characteristic_id]) byChar[r.characteristic_id] = [];
        byChar[r.characteristic_id].push(r);
      }

      let ncrNum = (ncrCount || 0) + 1;
      for (const [charId, charReadings] of Object.entries(byChar)) {
        const char = charMap[charId];
        const sample = charReadings[0];
        const ncr_number = `NCR-${new Date().getFullYear()}-${String(ncrNum).padStart(4,'0')}`;
        ncrNum++;

        const { data: ncr } = await supabase.from('ncrs').insert({
          org_id: req.user.org_id,
          ncr_number,
          inspection_order_id: req.params.id,
          part_id: order?.part_id,
          supplier_id: order?.supplier_id,
          title: `Out of Spec: ${order?.parts?.part_number} — ${chars.find(c=>c.id===charId) ? 'characteristic' : charId}`,
          description: `${charReadings.length} reading(s) out of specification. Values: ${charReadings.map(r=>`${r.actual_value}`).join(', ')}`,
          severity: 'major',
          quantity_affected: charReadings.length,
          status: 'open',
          created_by: req.user.id
        }).select().single();

        if (ncr) {
          ncrIds.push(ncr.id);
          // Link readings to NCR
          await supabase.from('ncr_readings').insert(
            charReadings.map(r => ({ ncr_id: ncr.id, reading_id: r.id }))
          );
        }
      }
    }

    // Update inspection status to in_progress
    await supabase.from('inspection_orders').update({ status: 'in_progress' })
      .eq('id', req.params.id).eq('status', 'open');

    res.status(201).json({ readings: created, ncrs_created: ncrIds.length, ncr_ids: ncrIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/:id/readings
router.get('/:id/readings', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('readings')
    .select('*, characteristics(name,nominal,usl,lsl,unit,critical), users!technician_id(name)')
    .eq('inspection_order_id', req.params.id)
    .order('sample_number').order('characteristic_id');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/inspections/:id/complete — mark complete, set pass/fail result
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const { data: readingStats } = await supabase.from('readings')
      .select('in_spec').eq('inspection_order_id', req.params.id);

    const outOfSpec = readingStats?.filter(r => r.in_spec === false).length || 0;
    const result = outOfSpec > 0 ? 'fail' : 'pass';

    const { data, error } = await supabase.from('inspection_orders').update({
      status: 'complete',
      result,
      completed_by: req.user.id,
      completed_at: new Date().toISOString()
    }).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
    if (error) throw new Error(error.message);

    res.json({ ...data, out_of_spec_count: outOfSpec });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inspections/aql/:lotSize — AQL lookup utility
router.get('/aql/:lotSize', requireAuth, (req, res) => {
  const result = getAQLSampleSize(parseInt(req.params.lotSize));
  res.json(result);
});

module.exports = router;
