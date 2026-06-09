const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/gauges
router.get('/', requireAuth, async (req, res) => {
  try {
    const gauges = await db.query(
      `SELECT *,
        CASE WHEN calibration_due < CURRENT_DATE AND status = 'current'
          THEN 'overdue' ELSE status END AS computed_status
       FROM gauges
       WHERE org_id = $1
       ORDER BY
         CASE WHEN calibration_due < CURRENT_DATE THEN 0 ELSE 1 END,
         calibration_due NULLS LAST,
         name`,
      [req.user.orgId]
    );
    res.json(gauges);
  } catch (err) {
    console.error('Get gauges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/gauges
router.post('/', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { name, type, serial_number, calibration_due, status = 'current' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const gauge = await db.one(
      `INSERT INTO gauges (org_id, name, type, serial_number, calibration_due, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.orgId, name, type || null, serial_number || null, calibration_due || null, status]
    );
    res.status(201).json(gauge);
  } catch (err) {
    console.error('Create gauge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/gauges/:id
router.patch('/:id', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { name, type, serial_number, calibration_due, status } = req.body;
    const gauge = await db.one(
      `UPDATE gauges SET
        name             = COALESCE($1, name),
        type             = COALESCE($2, type),
        serial_number    = COALESCE($3, serial_number),
        calibration_due  = COALESCE($4, calibration_due),
        status           = COALESCE($5, status)
       WHERE id = $6 AND org_id = $7 RETURNING *`,
      [name, type, serial_number, calibration_due, status, req.params.id, req.user.orgId]
    );
    if (!gauge) return res.status(404).json({ error: 'Gauge not found' });
    res.json(gauge);
  } catch (err) {
    console.error('Update gauge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
