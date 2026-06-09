const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/control-plans
router.get('/', requireAuth, async (req, res) => {
  try {
    const plans = await db.query(
      `SELECT cp.*, p.part_number, p.revision, p.description AS part_description,
        (SELECT COUNT(*)::int FROM characteristics c WHERE c.control_plan_id = cp.id) AS characteristic_count,
        u.name AS created_by_name
       FROM control_plans cp
       JOIN parts p ON p.id = cp.part_id
       LEFT JOIN users u ON u.id = cp.created_by
       WHERE cp.org_id = $1
       ORDER BY cp.created_at DESC`,
      [req.user.orgId]
    );
    res.json(plans);
  } catch (err) {
    console.error('Get control plans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/control-plans
router.post('/', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { part_id, inspection_type = 'incoming' } = req.body;
    if (!part_id) return res.status(400).json({ error: 'part_id is required' });

    // Verify part belongs to org
    const part = await db.one('SELECT id FROM parts WHERE id = $1 AND org_id = $2', [part_id, req.user.orgId]);
    if (!part) return res.status(404).json({ error: 'Part not found' });

    const plan = await db.one(
      `INSERT INTO control_plans (org_id, part_id, inspection_type, status, created_by)
       VALUES ($1, $2, $3, 'draft', $4) RETURNING *`,
      [req.user.orgId, part_id, inspection_type, req.user.id]
    );
    res.status(201).json(plan);
  } catch (err) {
    console.error('Create control plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/control-plans/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const plan = await db.one(
      `SELECT cp.*, p.part_number, p.revision
       FROM control_plans cp
       JOIN parts p ON p.id = cp.part_id
       WHERE cp.id = $1 AND cp.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!plan) return res.status(404).json({ error: 'Control plan not found' });

    const characteristics = await db.query(
      `SELECT c.*, g.name AS gauge_name
       FROM characteristics c
       LEFT JOIN gauges g ON g.id = c.gauge_id
       WHERE c.control_plan_id = $1
       ORDER BY c.step_order, c.id`,
      [req.params.id]
    );

    res.json({ ...plan, characteristics });
  } catch (err) {
    console.error('Get control plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/control-plans/:id/approve
router.post('/:id/approve', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const plan = await db.one(
      'SELECT * FROM control_plans WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!plan) return res.status(404).json({ error: 'Control plan not found' });

    // Supersede any existing active plan for this part + type
    await db.run(
      `UPDATE control_plans SET status = 'superseded'
       WHERE org_id = $1 AND part_id = $2 AND inspection_type = $3 AND status = 'active' AND id != $4`,
      [req.user.orgId, plan.part_id, plan.inspection_type, req.params.id]
    );

    const updated = await db.one(
      `UPDATE control_plans SET status = 'active' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('Approve control plan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/control-plans/:id/characteristics
router.post('/:id/characteristics', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const plan = await db.one(
      'SELECT id FROM control_plans WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!plan) return res.status(404).json({ error: 'Control plan not found' });

    const { name, char_type = 'variable', nominal, usl, lsl, unit, gauge_id, critical = false, step_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Determine next step_order if not provided
    let order = step_order;
    if (order == null) {
      const max = await db.one(
        'SELECT MAX(step_order) AS m FROM characteristics WHERE control_plan_id = $1',
        [req.params.id]
      );
      order = (max?.m ?? -1) + 1;
    }

    const char = await db.one(
      `INSERT INTO characteristics
         (control_plan_id, name, char_type, nominal, usl, lsl, unit, gauge_id, critical, step_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.params.id, name, char_type, nominal ?? null, usl ?? null, lsl ?? null, unit || null, gauge_id || null, critical, order]
    );
    res.status(201).json(char);
  } catch (err) {
    console.error('Add characteristic error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/control-plans/:id/characteristics/:charId
router.delete('/:id/characteristics/:charId', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    // Verify ownership via control plan → org
    const char = await db.one(
      `SELECT c.id FROM characteristics c
       JOIN control_plans cp ON cp.id = c.control_plan_id
       WHERE c.id = $1 AND cp.id = $2 AND cp.org_id = $3`,
      [req.params.charId, req.params.id, req.user.orgId]
    );
    if (!char) return res.status(404).json({ error: 'Characteristic not found' });
    await db.run('DELETE FROM characteristics WHERE id = $1', [req.params.charId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete characteristic error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
