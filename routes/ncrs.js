const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { status, severity, assigned_to } = req.query;
  let query = supabase.from('ncrs')
    .select('*, parts(part_number,description), suppliers(name), users!assigned_to(name), inspection_orders(order_number)')
    .eq('org_id', req.user.org_id).order('created_at', { ascending: false });
  if (status)      query = query.eq('status', status);
  if (severity)    query = query.eq('severity', severity);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('ncrs')
    .select(`*, parts(part_number,description), suppliers(name),
      users!assigned_to(name), inspection_orders(order_number),
      ncr_readings(reading_id, readings(actual_value, deviation, characteristic_id,
        characteristics(name,nominal,usl,lsl,unit))),
      capas(id,capa_number,title,status,due_date)`)
    .eq('id', req.params.id).eq('org_id', req.user.org_id).single();
  if (error) return res.status(404).json({ error: 'NCR not found' });
  res.json(data);
});

router.post('/', requireAuth, async (req, res) => {
  const { title, description, severity, inspection_order_id, part_id, supplier_id,
          defect_type, defect_location, quantity_affected, assigned_to, team_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const { count } = await supabase.from('ncrs')
    .select('*', { count: 'exact', head: true }).eq('org_id', req.user.org_id);
  const ncr_number = `NCR-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
  const { data, error } = await supabase.from('ncrs').insert({
    org_id: req.user.org_id, team_id: team_id||null, ncr_number, title, description,
    severity: severity||'major', inspection_order_id, part_id, supplier_id,
    defect_type, defect_location, quantity_affected, assigned_to, created_by: req.user.id
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const fields = ['title','description','severity','status','defect_type','defect_location',
    'quantity_affected','disposition','disposition_notes','assigned_to'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.disposition) {
    updates.disposition_approved_by = req.user.id;
    updates.disposition_approved_at = new Date().toISOString();
  }
  if (req.body.status === 'closed') {
    updates.closed_by = req.user.id;
    updates.closed_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from('ncrs')
    .update(updates).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
