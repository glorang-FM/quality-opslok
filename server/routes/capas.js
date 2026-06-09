const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/capas
router.get('/', requireAuth, async (req, res) => {
  try {
    const capas = await db.query(
      `SELECT ca.*, n.ncr_number, u.name AS assigned_name
       FROM capas ca
       LEFT JOIN ncrs n ON n.id = ca.ncr_id
       LEFT JOIN users u ON u.id = ca.assigned_to
       WHERE ca.org_id = $1
       ORDER BY ca.created_at DESC`,
      [req.user.orgId]
    );
    res.json(capas);
  } catch (err) {
    console.error('Get CAPAs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/capas
router.post('/', requireAuth, async (req, res) => {
  try {
    const { ncr_id, assigned_to } = req.body;

    // Verify NCR belongs to org if provided
    if (ncr_id) {
      const ncr = await db.one('SELECT id FROM ncrs WHERE id = $1 AND org_id = $2', [ncr_id, req.user.orgId]);
      if (!ncr) return res.status(404).json({ error: 'NCR not found' });
    }

    const capa = await db.one(
      `INSERT INTO capas (org_id, ncr_id, assigned_to, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.orgId, ncr_id || null, assigned_to || req.user.id, req.user.id]
    );
    res.status(201).json(capa);
  } catch (err) {
    console.error('Create CAPA error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/capas/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const capa = await db.one(
      `SELECT ca.*, n.ncr_number, n.title AS ncr_title, u.name AS assigned_name
       FROM capas ca
       LEFT JOIN ncrs n ON n.id = ca.ncr_id
       LEFT JOIN users u ON u.id = ca.assigned_to
       WHERE ca.id = $1 AND ca.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    res.json(capa);
  } catch (err) {
    console.error('Get CAPA error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/capas/:id
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const {
      immediate_action, why_1, why_2, why_3, why_4, why_5,
      corrective_action, effectiveness_criteria, effectiveness_date, assigned_to, status
    } = req.body;

    const capa = await db.one(
      `UPDATE capas SET
        immediate_action       = COALESCE($1, immediate_action),
        why_1                  = COALESCE($2, why_1),
        why_2                  = COALESCE($3, why_2),
        why_3                  = COALESCE($4, why_3),
        why_4                  = COALESCE($5, why_4),
        why_5                  = COALESCE($6, why_5),
        corrective_action      = COALESCE($7, corrective_action),
        effectiveness_criteria = COALESCE($8, effectiveness_criteria),
        effectiveness_date     = COALESCE($9, effectiveness_date),
        assigned_to            = COALESCE($10, assigned_to),
        status                 = COALESCE($11, status)
       WHERE id = $12 AND org_id = $13 RETURNING *`,
      [immediate_action, why_1, why_2, why_3, why_4, why_5,
       corrective_action, effectiveness_criteria, effectiveness_date || null,
       assigned_to, status, req.params.id, req.user.orgId]
    );
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    res.json(capa);
  } catch (err) {
    console.error('Update CAPA error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/capas/:id/close
router.post('/:id/close', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const capa = await db.one(
      `UPDATE capas SET status = 'closed', closed_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user.orgId]
    );
    if (!capa) return res.status(404).json({ error: 'CAPA not found' });
    res.json(capa);
  } catch (err) {
    console.error('Close CAPA error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
