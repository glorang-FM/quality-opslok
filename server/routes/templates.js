const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const templates = await db.query(
      `SELECT t.*, u.name AS created_by_name
       FROM inspection_templates t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.org_id = $1 AND t.active = 1
       ORDER BY t.name`,
      [req.user.orgId]
    );
    res.json(templates.map(t => ({ ...t, items: JSON.parse(t.items || '[]') })));
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/templates/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const t = await db.one(
      `SELECT t.*, u.name AS created_by_name
       FROM inspection_templates t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = $1 AND t.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json({ ...t, items: JSON.parse(t.items || '[]') });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/templates
router.post('/', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const { name, description, category, items } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const t = await db.one(
      `INSERT INTO inspection_templates (org_id, name, description, category, items, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.orgId, name, description || null, category || null, JSON.stringify(items || []), req.user.id]
    );
    res.status(201).json({ ...t, items: JSON.parse(t.items) });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/templates/:id
router.put('/:id', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    const { name, description, category, items } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const t = await db.one(
      `UPDATE inspection_templates
       SET name = $1, description = $2, category = $3, items = $4, updated_at = NOW()
       WHERE id = $5 AND org_id = $6
       RETURNING *`,
      [name, description || null, category || null, JSON.stringify(items || []), req.params.id, req.user.orgId]
    );
    if (!t) return res.status(404).json({ error: 'Template not found' });
    res.json({ ...t, items: JSON.parse(t.items) });
  } catch (err) {
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/templates/:id — soft delete
router.delete('/:id', requireAuth, requireRole('manager'), async (req, res) => {
  try {
    await db.run(
      `UPDATE inspection_templates SET active = 0 WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
