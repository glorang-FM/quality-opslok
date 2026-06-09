const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth } = require('./auth');

const router = express.Router();

const SUPERADMIN_EMAIL = 'glorang@overtureairquality.com';

async function requireSuperAdmin(req, res, next) {
  try {
    const user = await db.one('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (!user || user.email.toLowerCase() !== SUPERADMIN_EMAIL) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
}

// GET /api/superadmin/stats
router.get('/stats', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const [orgs, users, inspections, ncrs] = await Promise.all([
      db.one('SELECT COUNT(*)::int AS count FROM organizations'),
      db.one('SELECT COUNT(*)::int AS count FROM users'),
      db.one('SELECT COUNT(*)::int AS count FROM inspections'),
      db.one('SELECT COUNT(*)::int AS count FROM ncrs'),
    ]);
    res.json({
      orgs: orgs.count,
      users: users.count,
      inspections: inspections.count,
      ncrs: ncrs.count,
    });
  } catch (err) {
    console.error('Superadmin stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/superadmin/orgs
router.get('/orgs', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const orgs = await db.query(`
      SELECT
        o.id, o.name, o.slug, o.created_at, o.allowed_domain,
        o.trial_ends_at, o.paid_through, o.sub_status, o.plan,
        COUNT(DISTINCT u.id)::int  AS user_count,
        COUNT(DISTINCT i.id)::int  AS inspection_count,
        COUNT(DISTINCT n.id)::int  AS ncr_count
      FROM organizations o
      LEFT JOIN users u        ON u.org_id = o.id
      LEFT JOIN inspections i  ON i.org_id = o.id
      LEFT JOIN ncrs n         ON n.org_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(orgs);
  } catch (err) {
    console.error('Superadmin orgs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/orgs/:id/paid-through
router.put('/orgs/:id/paid-through', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { paid_through } = req.body;
    await db.run(
      'UPDATE organizations SET paid_through = $1 WHERE id = $2',
      [paid_through || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update paid_through error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
