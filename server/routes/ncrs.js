const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/ncrs
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, severity } = req.query;
    let where = 'WHERE n.org_id = $1';
    const params = [req.user.orgId];
    let idx = 2;

    if (status) { where += ` AND n.status = $${idx++}`; params.push(status); }
    if (severity) { where += ` AND n.severity = $${idx++}`; params.push(severity); }

    const ncrs = await db.query(
      `SELECT n.*, u.name AS assigned_name, cb.name AS created_by_name,
              i.title AS inspection_title,
              (SELECT COUNT(*)::int FROM corrective_actions ca WHERE ca.ncr_id = n.id) AS action_count,
              (SELECT COUNT(*)::int FROM corrective_actions ca WHERE ca.ncr_id = n.id AND ca.status = 'completed') AS actions_completed
       FROM ncrs n
       LEFT JOIN users u ON u.id = n.assigned_to
       LEFT JOIN users cb ON cb.id = n.created_by
       LEFT JOIN inspections i ON i.id = n.inspection_id
       ${where}
       ORDER BY
         CASE n.status WHEN 'open' THEN 1 WHEN 'investigating' THEN 2 ELSE 3 END,
         CASE n.severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 ELSE 3 END,
         n.created_at DESC`,
      params
    );
    res.json(ncrs);
  } catch (err) {
    console.error('Get NCRs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/ncrs/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const ncr = await db.one(
      `SELECT n.*, u.name AS assigned_name, cb.name AS created_by_name, i.title AS inspection_title
       FROM ncrs n
       LEFT JOIN users u ON u.id = n.assigned_to
       LEFT JOIN users cb ON cb.id = n.created_by
       LEFT JOIN inspections i ON i.id = n.inspection_id
       WHERE n.id = $1 AND n.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });

    const actions = await db.query(
      `SELECT ca.*, u.name AS assigned_name
       FROM corrective_actions ca
       LEFT JOIN users u ON u.id = ca.assigned_to
       WHERE ca.ncr_id = $1
       ORDER BY ca.created_at`,
      [req.params.id]
    );

    res.json({ ...ncr, corrective_actions: actions });
  } catch (err) {
    console.error('Get NCR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/ncrs
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, severity, inspection_id, assigned_to, due_date, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // Auto-generate NCR number: NCR-YYYYMM-NNN
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const countRow = await db.one(
      `SELECT COUNT(*)::int AS count FROM ncrs WHERE org_id = $1 AND ncr_number LIKE $2`,
      [req.user.orgId, `NCR-${ym}-%`]
    );
    const seq = String((countRow.count || 0) + 1).padStart(3, '0');
    const ncrNumber = `NCR-${ym}-${seq}`;

    const ncr = await db.one(
      `INSERT INTO ncrs (org_id, inspection_id, ncr_number, title, description, severity, assigned_to, due_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.orgId,
        inspection_id || null,
        ncrNumber,
        title,
        description || null,
        severity || 'minor',
        assigned_to || null,
        due_date || null,
        notes || null,
        req.user.id,
      ]
    );
    res.status(201).json(ncr);
  } catch (err) {
    console.error('Create NCR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/ncrs/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, description, severity, status, assigned_to, due_date, root_cause, notes } = req.body;

    const ncr = await db.one(
      `UPDATE ncrs
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           severity = COALESCE($3, severity),
           status = COALESCE($4, status),
           assigned_to = COALESCE($5, assigned_to),
           due_date = COALESCE($6, due_date),
           root_cause = COALESCE($7, root_cause),
           notes = COALESCE($8, notes),
           updated_at = NOW()
       WHERE id = $9 AND org_id = $10
       RETURNING *`,
      [title, description, severity, status, assigned_to, due_date, root_cause, notes, req.params.id, req.user.orgId]
    );
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });
    res.json(ncr);
  } catch (err) {
    console.error('Update NCR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/ncrs/:id/actions — add corrective action
router.post('/:id/actions', requireAuth, async (req, res) => {
  try {
    const { description, assigned_to, due_date, notes } = req.body;
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const ncr = await db.one('SELECT id FROM ncrs WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });

    const action = await db.one(
      `INSERT INTO corrective_actions (ncr_id, description, assigned_to, due_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, description, assigned_to || null, due_date || null, notes || null]
    );
    res.status(201).json(action);
  } catch (err) {
    console.error('Create corrective action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/ncrs/:id/actions/:actionId
router.put('/:id/actions/:actionId', requireAuth, async (req, res) => {
  try {
    const { description, assigned_to, due_date, status, notes } = req.body;

    const ncr = await db.one('SELECT id FROM ncrs WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });

    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    const action = await db.one(
      `UPDATE corrective_actions
       SET description = COALESCE($1, description),
           assigned_to = COALESCE($2, assigned_to),
           due_date = COALESCE($3, due_date),
           status = COALESCE($4, status),
           notes = COALESCE($5, notes),
           completed_at = CASE WHEN $4 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $6 AND ncr_id = $7
       RETURNING *`,
      [description, assigned_to, due_date, status, notes, req.params.actionId, req.params.id]
    );
    if (!action) return res.status(404).json({ error: 'Action not found' });
    res.json(action);
  } catch (err) {
    console.error('Update corrective action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
