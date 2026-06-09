const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/dashboard
router.get('/', requireAuth, async (req, res) => {
  try {
    const orgId = req.user.orgId;

    const [
      totalInspections,
      passedInspections,
      failedInspections,
      openNcrs,
      criticalNcrs,
      recentInspections,
      recentNcrs,
    ] = await Promise.all([
      db.one(`SELECT COUNT(*)::int AS count FROM inspections WHERE org_id = $1`, [orgId]),
      db.one(`SELECT COUNT(*)::int AS count FROM inspections WHERE org_id = $1 AND result = 'passed'`, [orgId]),
      db.one(`SELECT COUNT(*)::int AS count FROM inspections WHERE org_id = $1 AND result = 'failed'`, [orgId]),
      db.one(`SELECT COUNT(*)::int AS count FROM ncrs WHERE org_id = $1 AND status NOT IN ('closed','resolved')`, [orgId]),
      db.one(`SELECT COUNT(*)::int AS count FROM ncrs WHERE org_id = $1 AND severity = 'critical' AND status NOT IN ('closed','resolved')`, [orgId]),
      db.query(`
        SELECT i.id, i.title, i.status, i.result, i.location, i.created_at,
               u.name AS inspector_name
        FROM inspections i
        LEFT JOIN users u ON u.id = i.inspector_id
        WHERE i.org_id = $1
        ORDER BY i.created_at DESC LIMIT 10
      `, [orgId]),
      db.query(`
        SELECT n.id, n.ncr_number, n.title, n.severity, n.status, n.created_at,
               u.name AS assigned_name
        FROM ncrs n
        LEFT JOIN users u ON u.id = n.assigned_to
        WHERE n.org_id = $1 AND n.status NOT IN ('closed','resolved')
        ORDER BY
          CASE n.severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 ELSE 3 END,
          n.created_at DESC
        LIMIT 10
      `, [orgId]),
    ]);

    const passRate = totalInspections.count > 0
      ? Math.round((passedInspections.count / totalInspections.count) * 100)
      : null;

    res.json({
      stats: {
        total_inspections: totalInspections.count,
        passed: passedInspections.count,
        failed: failedInspections.count,
        pass_rate: passRate,
        open_ncrs: openNcrs.count,
        critical_ncrs: criticalNcrs.count,
      },
      recent_inspections: recentInspections,
      open_ncrs: recentNcrs,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
