const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Get control plan with all characteristics
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('control_plans')
    .select('*, parts(part_number,description,revision), characteristics(*, gauges(name,serial_number,status))')
    .eq('id', req.params.id).eq('org_id', req.user.org_id).single();
  if (error) return res.status(404).json({ error: 'Control plan not found' });
  res.json(data);
});

// Add a characteristic manually
router.post('/:id/characteristics', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { name, description, nominal, usl, lsl, unit, gauge_id, gauge_type,
          measurement_method, sample_frequency, critical, char_type } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const { data: existing } = await supabase.from('characteristics')
    .select('sequence').eq('control_plan_id', req.params.id)
    .order('sequence', { ascending: false }).limit(1);
  const seq = (existing?.[0]?.sequence || 0) + 1;

  const { data, error } = await supabase.from('characteristics').insert({
    control_plan_id: req.params.id, org_id: req.user.org_id,
    sequence: seq, name, description, nominal, usl, lsl, unit,
    gauge_id, gauge_type, measurement_method,
    sample_frequency: sample_frequency || 'per lot',
    critical: critical || false, char_type: char_type || 'variable'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Update a characteristic
router.put('/:planId/characteristics/:charId', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const fields = ['name','description','nominal','usl','lsl','unit','gauge_id',
    'gauge_type','measurement_method','sample_frequency','critical','char_type','sequence'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  const { data, error } = await supabase.from('characteristics')
    .update(updates).eq('id', req.params.charId).eq('control_plan_id', req.params.planId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Delete a characteristic
router.delete('/:planId/characteristics/:charId', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { error } = await supabase.from('characteristics')
    .delete().eq('id', req.params.charId).eq('control_plan_id', req.params.planId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// Approve/activate a control plan
router.post('/:id/approve', requireAuth, requireRole('manager','admin'), async (req, res) => {
  // Supersede any existing active plan for same part+type
  const { data: plan } = await supabase.from('control_plans')
    .select('part_id,inspection_type').eq('id', req.params.id).single();
  if (plan) {
    await supabase.from('control_plans').update({ status: 'superseded' })
      .eq('part_id', plan.part_id).eq('inspection_type', plan.inspection_type).eq('status', 'active');
  }
  const { data, error } = await supabase.from('control_plans').update({
    status: 'active', approved_by: req.user.id, approved_at: new Date().toISOString()
  }).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
