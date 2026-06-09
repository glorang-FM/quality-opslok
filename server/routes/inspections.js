const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/inspections
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, result, limit = 50, offset = 0 } = req.query;
    let where = 'WHERE i.org_id = $1';
    const params = [req.user.orgId];
    let idx = 2;

    if (status) { where += ` AND i.status = $${idx++}`; params.push(status); }
    if (result) { where += ` AND i.result = $${idx++}`; params.push(result); }

    const inspections = await db.query(
      `SELECT i.*, u.name AS inspector_name, t.name AS template_name,
              (SELECT COUNT(*)::int FROM inspection_items ii WHERE ii.inspection_id = i.id) AS item_count,
              (SELECT COUNT(*)::int FROM inspection_items ii WHERE ii.inspection_id = i.id AND ii.result = 'fail') AS fail_count
       FROM inspections i
       LEFT JOIN users u ON u.id = i.inspector_id
       LEFT JOIN inspection_templates t ON t.id = i.template_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json(inspections);
  } catch (err) {
    console.error('Get inspections error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inspections/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const inspection = await db.one(
      `SELECT i.*, u.name AS inspector_name, t.name AS template_name
       FROM inspections i
       LEFT JOIN users u ON u.id = i.inspector_id
       LEFT JOIN inspection_templates t ON t.id = i.template_id
       WHERE i.id = $1 AND i.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!inspection) return res.status(404).json({ error: 'Inspection not found' });

    const items = await db.query(
      'SELECT * FROM inspection_items WHERE inspection_id = $1 ORDER BY step_order',
      [req.params.id]
    );
    const ncrs = await db.query(
      `SELECT n.*, u.name AS assigned_name
       FROM ncrs n
       LEFT JOIN users u ON u.id = n.assigned_to
       WHERE n.inspection_id = $1`,
      [req.params.id]
    );

    res.json({ ...inspection, items, ncrs });
  } catch (err) {
    console.error('Get inspection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inspections
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, template_id, category, location, batch_number, items } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const inspection = await db.one(
      `INSERT INTO inspections (org_id, template_id, title, category, location, batch_number, inspector_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
       RETURNING *`,
      [req.user.orgId, template_id || null, title, category || null, location || null, batch_number || null, req.user.id]
    );

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        await db.run(
          `INSERT INTO inspection_items (inspection_id, step_order, description, result)
           VALUES ($1, $2, $3, 'pending')`,
          [inspection.id, i, items[i].description || items[i]]
        );
      }
    }

    res.status(201).json(inspection);
  } catch (err) {
    console.error('Create inspection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/inspections/:id — update header fields or status
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, location, batch_number, notes, status, result, started_at, completed_at } = req.body;

    const inspection = await db.one(
      `UPDATE inspections
       SET title = COALESCE($1, title),
           location = COALESCE($2, location),
           batch_number = COALESCE($3, batch_number),
           notes = COALESCE($4, notes),
           status = COALESCE($5, status),
           result = COALESCE($6, result),
           started_at = COALESCE($7, started_at),
           completed_at = COALESCE($8, completed_at)
       WHERE id = $9 AND org_id = $10
       RETURNING *`,
      [title, location, batch_number, notes, status, result, started_at, completed_at, req.params.id, req.user.orgId]
    );
    if (!inspection) return res.status(404).json({ error: 'Inspection not found' });
    res.json(inspection);
  } catch (err) {
    console.error('Update inspection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/inspections/:id/items/:itemId — record a checklist result
router.put('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const { result, notes } = req.body;
    if (!['pass', 'fail', 'na', 'pending'].includes(result)) {
      return res.status(400).json({ error: 'result must be pass, fail, na, or pending' });
    }

    // Verify item belongs to this inspection and org
    const item = await db.one(
      `SELECT ii.* FROM inspection_items ii
       JOIN inspections i ON i.id = ii.inspection_id
       WHERE ii.id = $1 AND ii.inspection_id = $2 AND i.org_id = $3`,
      [req.params.itemId, req.params.id, req.user.orgId]
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const updated = await db.one(
      `UPDATE inspection_items SET result = $1, notes = $2 WHERE id = $3 RETURNING *`,
      [result, notes || null, req.params.itemId]
    );
    res.json(updated);
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/inspections/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const inspection = await db.one(
      'SELECT id FROM inspections WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!inspection) return res.status(404).json({ error: 'Inspection not found' });
    await db.run('DELETE FROM inspections WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete inspection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
