const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('parts')
    .select('*, control_plans(id,inspection_type,status,revision)')
    .eq('org_id', req.user.org_id).eq('active', true)
    .order('part_number');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('parts')
    .select('*, control_plans(*, characteristics(*))')
    .eq('id', req.params.id).eq('org_id', req.user.org_id).single();
  if (error) return res.status(404).json({ error: 'Part not found' });
  res.json(data);
});

router.post('/', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { part_number, revision, description, category, unit_of_issue, notes, team_id } = req.body;
  if (!part_number || !description) return res.status(400).json({ error: 'part_number and description required' });
  const { data, error } = await supabase.from('parts').insert({
    org_id: req.user.org_id, team_id: team_id || null,
    part_number, revision: revision || 'A', description, category, unit_of_issue, notes
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { description, category, notes, active } = req.body;
  const { data, error } = await supabase.from('parts')
    .update({ description, category, notes, active })
    .eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Control plans for a part
router.get('/:id/control-plans', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('control_plans')
    .select('*, characteristics(id,sequence,name,nominal,usl,lsl,unit,critical,char_type)')
    .eq('part_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create control plan for a part
router.post('/:id/control-plans', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { inspection_type, revision, title, aql_level, sample_size, notes } = req.body;
  if (!inspection_type) return res.status(400).json({ error: 'inspection_type required' });
  const { data, error } = await supabase.from('control_plans').insert({
    org_id: req.user.org_id, part_id: req.params.id,
    inspection_type, revision: revision || '1', title, aql_level, sample_size, notes,
    created_by: req.user.id, status: 'draft'
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
