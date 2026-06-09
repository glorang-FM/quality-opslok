const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('gauges')
    .select('*').eq('org_id', req.user.org_id)
    .neq('status','retired').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireAuth, requireRole('manager','admin'), async (req, res) => {
  const { data, error } = await supabase.from('gauges').insert({
    org_id: req.user.org_id, ...req.body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAuth, requireRole('manager','admin'), async (req, res) => {
  // Auto-update status based on calibration date
  const updates = { ...req.body };
  if (updates.calibration_due) {
    updates.status = new Date(updates.calibration_due) < new Date() ? 'overdue' : 'current';
  }
  const { data, error } = await supabase.from('gauges')
    .update(updates).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
