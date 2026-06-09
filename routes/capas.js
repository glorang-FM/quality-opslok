const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  let query = supabase.from('capas')
    .select('*, ncrs(ncr_number,title), users!owner_id(name)')
    .eq('org_id', req.user.org_id).order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', requireAuth, async (req, res) => {
  const { count } = await supabase.from('capas')
    .select('*',{count:'exact',head:true}).eq('org_id',req.user.org_id);
  const capa_number = `CAPA-${new Date().getFullYear()}-${String((count||0)+1).padStart(4,'0')}`;
  const { data, error } = await supabase.from('capas').insert({
    org_id: req.user.org_id, capa_number, created_by: req.user.id, ...req.body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const updates = { ...req.body };
  if (updates.status === 'closed') { updates.closed_by = req.user.id; updates.closed_at = new Date().toISOString(); }
  const { data, error } = await supabase.from('capas')
    .update(updates).eq('id', req.params.id).eq('org_id', req.user.org_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
