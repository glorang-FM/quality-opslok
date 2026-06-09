const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/parts
router.get('/', requireAuth, async (req, res) => {
  try {
    const parts = await db.query(
      `SELECT p.*,
        (SELECT COUNT(*)::int FROM control_plans cp WHERE cp.part_id = p.id) AS plan_count
       FROM parts p
       WHERE p.org_id = $1
       ORDER BY p.part_number, p.revision`,
      [req.user.orgId]
    );
    res.json(parts);
  } catch (err) {
    console.error('Get parts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/parts
router.post('/', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { part_number, description, revision = 'A' } = req.body;
    if (!part_number) return res.status(400).json({ error: 'part_number is required' });

    const part = await db.one(
      `INSERT INTO parts (org_id, part_number, description, revision)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (org_id, part_number, revision) DO UPDATE
         SET description = EXCLUDED.description
       RETURNING *`,
      [req.user.orgId, part_number, description || null, revision]
    );
    res.status(201).json(part);
  } catch (err) {
    console.error('Create part error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/parts/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const part = await db.one(
      'SELECT * FROM parts WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!part) return res.status(404).json({ error: 'Part not found' });
    res.json(part);
  } catch (err) {
    console.error('Get part error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
