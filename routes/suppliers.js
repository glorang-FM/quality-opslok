const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('vw_supplier_scorecard')
    .select('*').eq('org_id', req.user.org_id).order('supplier_name');
  if (error) {
    // Fallback if view not available
    const { data: raw } = await supabase.from('suppliers')
      .select('*').eq('org_id', req.user.org_id).order('name');
    return res.json(raw || []);
  }
  res.json(data);
});

router.post('/', requireAuth, requireRole('manager','admin'), async (req, res) => {
  const { data, error } = await supabase.from('suppliers').insert({
    org_id: req.user.org_id, ...req.body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAuth, requireRole('manager','admin'), async (req, res) => {
  const { data, error } = await supabase.from('suppliers')
    .update(req.body).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
