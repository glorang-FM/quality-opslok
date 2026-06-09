const express = require('express');
const multer = require('multer');
const { db } = require('../db-adapter');
const { requireAuth, requireRole } = require('./auth');
const { parseDocument } = require('../services/ai-parser');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'text/csv', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|png|jpg|jpeg|xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

// GET /api/documents
router.get('/', requireAuth, async (req, res) => {
  try {
    const docs = await db.query(
      `SELECT d.*, p.part_number, p.revision, u.name AS uploaded_by_name
       FROM documents d
       LEFT JOIN parts p ON p.id = d.part_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.org_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.orgId]
    );
    res.json(docs);
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents/upload
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  try {
    const { part_id } = req.body;

    // Create document record
    const doc = await db.one(
      `INSERT INTO documents (org_id, part_id, filename, mime_type, parse_status, uploaded_by)
       VALUES ($1, $2, $3, $4, 'processing', $5) RETURNING *`,
      [req.user.orgId, part_id || null, req.file.originalname, req.file.mimetype, req.user.id]
    );

    // Respond immediately, parse asynchronously
    res.status(201).json({ document_id: doc.id, status: 'processing' });

    // Async AI parse
    setImmediate(async () => {
      try {
        const { rawText, parsed } = await parseDocument(req.file.buffer, req.file.mimetype, req.file.originalname);

        // Store extraction
        const extraction = await db.one(
          `INSERT INTO characteristic_extractions (document_id, ai_model, raw_ai_output, status)
           VALUES ($1, 'claude-opus-4-5', $2, 'pending_review') RETURNING *`,
          [doc.id, JSON.stringify(parsed)]
        );

        // Store each extracted item
        for (const item of (parsed.characteristics || [])) {
          await db.run(
            `INSERT INTO extraction_items
               (extraction_id, name, char_type, nominal, usl, lsl, unit, gauge_type, critical, ai_confidence, ai_notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [extraction.id, item.name, item.char_type || 'variable',
             item.nominal ?? null, item.usl ?? null, item.lsl ?? null,
             item.unit || null, item.gauge_type || null,
             item.critical || false, item.ai_confidence || 'medium', item.ai_notes || null]
          );
        }

        // Mark complete — store part_number/revision hint if found
        await db.run(
          `UPDATE documents SET parse_status = 'complete' WHERE id = $1`,
          [doc.id]
        );
        console.log(`Document ${doc.id} parsed: ${(parsed.characteristics || []).length} characteristics found`);
      } catch (err) {
        console.error('AI parse error for doc', doc.id, err.message);
        await db.run(`UPDATE documents SET parse_status = 'failed' WHERE id = $1`, [doc.id]);
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await db.one(
      'SELECT * FROM documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    console.error('Get document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id/extraction
router.get('/:id/extraction', requireAuth, async (req, res) => {
  try {
    const doc = await db.one(
      'SELECT * FROM documents WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const extraction = await db.one(
      'SELECT * FROM characteristic_extractions WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    if (!extraction) return res.status(404).json({ error: 'No extraction found' });

    const items = await db.query(
      'SELECT * FROM extraction_items WHERE extraction_id = $1 ORDER BY id',
      [extraction.id]
    );

    res.json({ document: doc, extraction, items });
  } catch (err) {
    console.error('Get extraction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents/:id/extraction/approve
router.post('/:id/extraction/approve', requireAuth, requireRole('engineer', 'manager'), async (req, res) => {
  try {
    const { control_plan_id, items } = req.body;
    if (!control_plan_id || !items?.length) {
      return res.status(400).json({ error: 'control_plan_id and items are required' });
    }

    // Verify control plan belongs to org
    const plan = await db.one(
      'SELECT id FROM control_plans WHERE id = $1 AND org_id = $2',
      [control_plan_id, req.user.orgId]
    );
    if (!plan) return res.status(404).json({ error: 'Control plan not found' });

    const created = [];
    for (const item of items) {
      // Get current extraction item
      const ei = await db.one(
        'SELECT * FROM extraction_items WHERE id = $1',
        [item.item_id]
      );
      if (!ei) continue;

      // Get next step_order
      const max = await db.one(
        'SELECT MAX(step_order) AS m FROM characteristics WHERE control_plan_id = $1',
        [control_plan_id]
      );
      const order = (max?.m ?? -1) + 1;

      // Create characteristic
      const char = await db.one(
        `INSERT INTO characteristics
           (control_plan_id, name, char_type, nominal, usl, lsl, unit, critical, step_order, source_document_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [control_plan_id, ei.name, ei.char_type,
         item.nominal ?? ei.nominal, item.usl ?? ei.usl, item.lsl ?? ei.lsl,
         item.unit ?? ei.unit, ei.critical, order, parseInt(req.params.id)]
      );

      // Mark extraction item as approved
      await db.run(
        `UPDATE extraction_items SET status = 'approved', characteristic_id = $1 WHERE id = $2`,
        [char.id, item.item_id]
      );

      created.push(char);
    }

    // Update extraction status
    const extraction = await db.one(
      'SELECT id FROM characteristic_extractions WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );
    if (extraction) {
      await db.run(
        `UPDATE characteristic_extractions SET status = 'partially_approved' WHERE id = $1`,
        [extraction.id]
      );
    }

    res.json({ created_count: created.length, characteristics: created });
  } catch (err) {
    console.error('Approve extraction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
