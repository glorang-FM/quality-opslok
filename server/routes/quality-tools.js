const express = require('express');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');

const router = express.Router();

// GET /api/quality-tools — list, optionally filter by type/ncr_id/capa_id
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type, ncr_id, capa_id } = req.query;
    let query = `
      SELECT qt.*, u.name AS created_by_name
      FROM quality_tools qt
      LEFT JOIN users u ON u.id = qt.created_by
      WHERE qt.org_id = $1
    `;
    const params = [req.user.orgId];
    if (type) { query += ` AND qt.type = $${params.length + 1}`; params.push(type); }
    if (ncr_id) { query += ` AND qt.ncr_id = $${params.length + 1}`; params.push(ncr_id); }
    if (capa_id) { query += ` AND qt.capa_id = $${params.length + 1}`; params.push(capa_id); }
    query += ' ORDER BY qt.updated_at DESC';

    const rows = await db.query(query, params);
    const result = rows.map(r => ({
      ...r,
      data: (() => { try { return JSON.parse(r.data); } catch { return {}; } })(),
    }));
    res.json(result);
  } catch (err) {
    console.error('quality-tools list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quality-tools/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await db.one(
      `SELECT qt.*, u.name AS created_by_name
       FROM quality_tools qt
       LEFT JOIN users u ON u.id = qt.created_by
       WHERE qt.id = $1 AND qt.org_id = $2`,
      [req.params.id, req.user.orgId]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, data: (() => { try { return JSON.parse(row.data); } catch { return {}; } })() });
  } catch (err) {
    console.error('quality-tools get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/quality-tools — create new tool
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, title, data = {}, ncr_id, capa_id } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });

    const VALID_TYPES = ['fishbone', 'fmea', 'check_sheet', 'gauge_rr', 'flowchart'];
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });

    const row = await db.one(
      `INSERT INTO quality_tools (org_id, type, title, data, ncr_id, capa_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.orgId, type, title, JSON.stringify(data), ncr_id || null, capa_id || null, req.user.id]
    );
    res.status(201).json({ ...row, data });
  } catch (err) {
    console.error('quality-tools create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/quality-tools/:id — update title, data, links
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await db.one(
      'SELECT * FROM quality_tools WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { title, data, ncr_id, capa_id } = req.body;
    const updated = await db.one(
      `UPDATE quality_tools SET
         title      = COALESCE($1, title),
         data       = COALESCE($2, data),
         ncr_id     = CASE WHEN $3::text IS NOT NULL THEN $3::integer ELSE ncr_id END,
         capa_id    = CASE WHEN $4::text IS NOT NULL THEN $4::integer ELSE capa_id END,
         updated_at = NOW()
       WHERE id = $5 AND org_id = $6
       RETURNING *`,
      [
        title || null,
        data != null ? JSON.stringify(data) : null,
        ncr_id != null ? String(ncr_id) : null,
        capa_id != null ? String(capa_id) : null,
        req.params.id,
        req.user.orgId,
      ]
    );
    res.json({ ...updated, data: (() => { try { return JSON.parse(updated.data); } catch { return {}; } })() });
  } catch (err) {
    console.error('quality-tools update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/quality-tools/:id
router.delete('/:id', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM quality_tools WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.user.orgId]
    );
    if (!result.length) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('quality-tools delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
