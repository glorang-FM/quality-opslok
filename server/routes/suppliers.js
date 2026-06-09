const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/suppliers — with computed scorecard from actual readings
router.get('/', requireAuth, async (req, res) => {
  try {
    const suppliers = await db.query(
      `SELECT s.*,
        COUNT(DISTINCT io.id)::int                                           AS total_inspections,
        COUNT(DISTINCT CASE WHEN io.result = 'pass' THEN io.id END)::int    AS passed_inspections,
        COUNT(r.id)::int                                                     AS total_readings,
        COUNT(CASE WHEN r.in_spec = true THEN 1 END)::int                   AS in_spec_count,
        CASE WHEN COUNT(r.id) > 0
          THEN ROUND(COUNT(CASE WHEN r.in_spec = true THEN 1 END)::numeric / COUNT(r.id) * 100, 1)
          ELSE NULL
        END                                                                  AS in_spec_rate_pct,
        CASE WHEN COUNT(DISTINCT io.id) > 0
          THEN ROUND(COUNT(DISTINCT CASE WHEN io.result = 'pass' THEN io.id END)::numeric / COUNT(DISTINCT io.id) * 100, 1)
          ELSE NULL
        END                                                                  AS pass_rate_pct
       FROM suppliers s
       LEFT JOIN inspection_orders io ON io.supplier_id = s.id
       LEFT JOIN readings r ON r.inspection_order_id = io.id
       WHERE s.org_id = $1 AND s.active = true
       GROUP BY s.id
       ORDER BY s.name`,
      [req.user.orgId]
    );
    res.json(suppliers);
  } catch (err) {
    console.error('Get suppliers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/suppliers
router.post('/', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { name, code, contact_email } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const supplier = await db.one(
      `INSERT INTO suppliers (org_id, name, code, contact_email)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.orgId, name, code || null, contact_email || null]
    );
    res.status(201).json(supplier);
  } catch (err) {
    console.error('Create supplier error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/suppliers/:id
router.patch('/:id', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { name, code, contact_email, active } = req.body;
    const supplier = await db.one(
      `UPDATE suppliers SET
        name          = COALESCE($1, name),
        code          = COALESCE($2, code),
        contact_email = COALESCE($3, contact_email),
        active        = COALESCE($4, active)
       WHERE id = $5 AND org_id = $6 RETURNING *`,
      [name, code, contact_email, active, req.params.id, req.user.orgId]
    );
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    console.error('Update supplier error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
