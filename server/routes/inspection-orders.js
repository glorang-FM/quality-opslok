const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// AQL 1.0 sampling lookup
function aqlSampleSize(lotSize) {
  const table = [
    [2, 2], [8, 3], [15, 5], [25, 8], [50, 13], [90, 20],
    [150, 32], [280, 50], [500, 80], [1200, 125], [3200, 200],
    [10000, 315], [35000, 500], [150000, 800]
  ];
  for (const [max, n] of table) {
    if (lotSize <= max) return n;
  }
  return 1250;
}

function generateOrderNumber() {
  const d = new Date();
  const yymm = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `IO-${yymm}-${rand}`;
}

// GET /api/inspection-orders
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let where = 'WHERE io.org_id = $1';
    const params = [req.user.orgId];
    if (status) { where += ` AND io.status = $2`; params.push(status); }

    const orders = await db.query(
      `SELECT io.*, p.part_number, p.revision, s.name AS supplier_name,
        u.name AS assigned_name,
        (SELECT COUNT(*)::int FROM readings r WHERE r.inspection_order_id = io.id) AS reading_count
       FROM inspection_orders io
       JOIN parts p ON p.id = io.part_id
       LEFT JOIN suppliers s ON s.id = io.supplier_id
       LEFT JOIN users u ON u.id = io.assigned_to
       ${where}
       ORDER BY io.created_at DESC
       LIMIT 100`,
      params
    );
    res.json(orders);
  } catch (err) {
    console.error('Get inspection orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inspection-orders
router.post('/', requireAuth, async (req, res) => {
  try {
    const { part_id, inspection_type = 'incoming', lot_size, supplier_id, assigned_to } = req.body;
    if (!part_id) return res.status(400).json({ error: 'part_id is required' });

    const part = await db.one('SELECT id FROM parts WHERE id = $1 AND org_id = $2', [part_id, req.user.orgId]);
    if (!part) return res.status(404).json({ error: 'Part not found' });

    // Find active control plan for this part + type
    const plan = await db.one(
      `SELECT id FROM control_plans WHERE part_id = $1 AND inspection_type = $2 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [part_id, inspection_type]
    );

    const sample_size = lot_size ? aqlSampleSize(parseInt(lot_size)) : null;

    // Unique order number
    let order_number;
    let attempts = 0;
    while (attempts < 5) {
      order_number = generateOrderNumber();
      const exists = await db.one(
        'SELECT id FROM inspection_orders WHERE org_id = $1 AND order_number = $2',
        [req.user.orgId, order_number]
      );
      if (!exists) break;
      attempts++;
    }

    const order = await db.one(
      `INSERT INTO inspection_orders
         (org_id, order_number, part_id, control_plan_id, supplier_id, inspection_type,
          lot_size, sample_size, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.user.orgId, order_number, part_id, plan?.id || null, supplier_id || null,
       inspection_type, lot_size || null, sample_size, assigned_to || req.user.id, req.user.id]
    );
    res.status(201).json(order);
  } catch (err) {
    console.error('Create inspection order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inspection-orders/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await db.one(
      `SELECT io.*, p.part_number, p.revision, s.name AS supplier_name, u.name AS assigned_name
       FROM inspection_orders io
       JOIN parts p ON p.id = io.part_id
       LEFT JOIN suppliers s ON s.id = io.supplier_id
       LEFT JOIN users u ON u.id = io.assigned_to
       WHERE io.id = $1 AND io.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Get characteristics from control plan (or all for part if no plan)
    let characteristics = [];
    if (order.control_plan_id) {
      characteristics = await db.query(
        `SELECT c.*, g.name AS gauge_name
         FROM characteristics c
         LEFT JOIN gauges g ON g.id = c.gauge_id
         WHERE c.control_plan_id = $1
         ORDER BY c.step_order, c.id`,
        [order.control_plan_id]
      );
    }

    // Get existing readings for this order
    const readings = await db.query(
      `SELECT r.*, c.name AS characteristic_name
       FROM readings r
       JOIN characteristics c ON c.id = r.characteristic_id
       WHERE r.inspection_order_id = $1
       ORDER BY r.sample_number, r.characteristic_id`,
      [req.params.id]
    );

    res.json({ order, characteristics, readings });
  } catch (err) {
    console.error('Get inspection order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inspection-orders/:id/readings — record a measurement
router.post('/:id/readings', requireAuth, async (req, res) => {
  try {
    const { characteristic_id, sample_number = 1, actual_value, notes } = req.body;
    if (!characteristic_id || actual_value == null) {
      return res.status(400).json({ error: 'characteristic_id and actual_value are required' });
    }

    // Get characteristic to compute in_spec
    const char = await db.one('SELECT * FROM characteristics WHERE id = $1', [characteristic_id]);
    if (!char) return res.status(404).json({ error: 'Characteristic not found' });

    let in_spec = true;
    let deviation = null;
    const numValue = parseFloat(actual_value);

    if (char.char_type === 'attribute') {
      in_spec = (String(actual_value).toLowerCase() === 'pass');
    } else {
      if (!isNaN(numValue)) {
        if (char.usl != null && numValue > parseFloat(char.usl)) in_spec = false;
        if (char.lsl != null && numValue < parseFloat(char.lsl)) in_spec = false;
        if (char.nominal != null) deviation = numValue - parseFloat(char.nominal);
      }
    }

    // Upsert reading (one per characteristic per sample)
    const reading = await db.one(
      `INSERT INTO readings
         (inspection_order_id, characteristic_id, technician_id, sample_number, actual_value, in_spec, deviation, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.params.id, characteristic_id, req.user.id, sample_number,
       String(actual_value), in_spec, deviation, notes || null]
    );

    // Auto-create NCR if out of spec and reading was new
    if (!in_spec && reading) {
      const order = await db.one(
        'SELECT * FROM inspection_orders WHERE id = $1', [req.params.id]
      );

      // Check if NCR already exists for this order + characteristic
      const existingNcr = await db.one(
        `SELECT n.id FROM ncrs n
         JOIN ncr_readings nr ON nr.ncr_id = n.id
         WHERE nr.reading_id = $1`,
        [reading.id]
      );

      if (!existingNcr) {
        // Count existing NCRs this month for number
        const count = await db.one(
          `SELECT COUNT(*)::int AS c FROM ncrs WHERE org_id = $1
           AND created_at >= date_trunc('month', CURRENT_DATE)`,
          [req.user.orgId]
        );
        const d = new Date();
        const ncr_number = `NCR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${String((count?.c||0)+1).padStart(3,'0')}`;

        const ncr = await db.one(
          `INSERT INTO ncrs
             (org_id, ncr_number, title, description, severity, status,
              inspection_order_id, part_id, supplier_id, created_by)
           VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9)
           RETURNING *`,
          [req.user.orgId, ncr_number,
           `Out of spec: ${char.name}`,
           `Actual: ${actual_value} ${char.unit||''} | Nominal: ${char.nominal||'-'} | USL: ${char.usl||'-'} | LSL: ${char.lsl||'-'}`,
           char.critical ? 'critical' : 'major',
           order.id, order.part_id, order.supplier_id || null, req.user.id]
        );

        await db.run(
          'INSERT INTO ncr_readings (ncr_id, reading_id) VALUES ($1, $2)',
          [ncr.id, reading.id]
        );
      }
    }

    res.status(201).json({ reading, in_spec, deviation });
  } catch (err) {
    console.error('Record reading error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inspection-orders/:id/complete
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const order = await db.one(
      'SELECT * FROM inspection_orders WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Compute result from readings
    const stats = await db.one(
      `SELECT COUNT(*)::int AS total,
        COUNT(CASE WHEN in_spec = false THEN 1 END)::int AS out_of_spec,
        COUNT(CASE WHEN in_spec = false AND c.critical = true THEN 1 END)::int AS critical_fails
       FROM readings r
       JOIN characteristics c ON c.id = r.characteristic_id
       WHERE r.inspection_order_id = $1`,
      [req.params.id]
    );

    let result = 'pass';
    if (stats.critical_fails > 0) result = 'fail';
    else if (stats.out_of_spec > 0) result = 'conditional_pass';

    const updated = await db.one(
      `UPDATE inspection_orders
       SET status = 'complete', result = $1, completed_at = NOW()
       WHERE id = $2 RETURNING *`,
      [result, req.params.id]
    );
    res.json({ order: updated, result, stats });
  } catch (err) {
    console.error('Complete inspection order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
