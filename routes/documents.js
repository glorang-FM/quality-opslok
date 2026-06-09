/**
 * Documents & AI Extraction Routes
 * POST /api/documents/upload  — upload file, trigger AI parse
 * GET  /api/documents/:id     — get document + extraction status
 * GET  /api/documents/:id/extraction — get extraction items for review
 * POST /api/documents/:id/extraction/approve — approve items, create characteristics
 * POST /api/documents/:id/extraction/reject  — reject extraction
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { parseDocument } = require('../services/ai-parser');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','image/jpeg','image/png','image/gif',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel','text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, true); // allow all, handle in route
  }
});

// POST /api/documents/upload
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { part_id, control_plan_id, doc_type = 'drawing', team_id } = req.body;
  const file = req.file;
  const ext = file.originalname.split('.').pop().toLowerCase();
  const storagePath = `${req.user.org_id}/documents/${Date.now()}_${file.originalname}`;

  try {
    // Upload to Supabase Storage
    const { error: storageErr } = await supabase.storage
      .from(process.env.STORAGE_BUCKET || 'quality-opslok')
      .upload(storagePath, file.buffer, { contentType: file.mimetype });
    if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from(process.env.STORAGE_BUCKET || 'quality-opslok')
      .getPublicUrl(storagePath);

    // Create document record
    const { data: doc, error: docErr } = await supabase.from('documents').insert({
      org_id: req.user.org_id,
      team_id: team_id || null,
      part_id: part_id || null,
      control_plan_id: control_plan_id || null,
      filename: file.originalname,
      file_url: publicUrl,
      file_type: ext,
      file_size_bytes: file.size,
      doc_type,
      uploaded_by: req.user.id,
      parse_status: 'processing'
    }).select().single();
    if (docErr) throw new Error(docErr.message);

    // Respond immediately, run AI parse async
    res.json({ document: doc, message: 'Upload complete. AI extraction in progress...' });

    // Async AI parsing (don't await — client already got response)
    parseDocument(file.buffer, file.mimetype, file.originalname)
      .then(async ({ rawOutput, parsed }) => {
        // Store extraction result
        const { data: extraction } = await supabase.from('characteristic_extractions').insert({
          document_id: doc.id,
          control_plan_id: control_plan_id || null,
          ai_model: 'claude-opus-4-5',
          raw_ai_output: parsed,
          status: 'pending_review'
        }).select().single();

        if (extraction && parsed.characteristics?.length) {
          // Store individual extraction items
          const items = parsed.characteristics.map((c, idx) => ({
            extraction_id: extraction.id,
            sequence: idx + 1,
            name: c.name,
            description: c.description,
            nominal: c.nominal,
            usl: c.usl,
            lsl: c.lsl,
            unit: c.unit,
            gauge_type: c.gauge_type,
            critical: c.critical || false,
            char_type: c.char_type || 'variable',
            ai_confidence: c.ai_confidence,
            ai_notes: c.ai_notes,
            status: 'pending'
          }));
          await supabase.from('extraction_items').insert(items);
        }

        // Update document parse status
        await supabase.from('documents').update({
          parse_status: 'complete',
          control_plan_id: control_plan_id || null
        }).eq('id', doc.id);
      })
      .catch(async (err) => {
        console.error('AI parse error:', err.message);
        await supabase.from('documents').update({
          parse_status: 'failed',
          parse_error: err.message
        }).eq('id', doc.id);
      });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('documents')
    .select('*, characteristic_extractions(id, status, extracted_at, characteristics_created)')
    .eq('id', req.params.id)
    .eq('org_id', req.user.org_id)
    .single();
  if (error) return res.status(404).json({ error: 'Document not found' });
  res.json(data);
});

// GET /api/documents/:id/extraction
router.get('/:id/extraction', requireAuth, async (req, res) => {
  const { data: doc } = await supabase.from('documents')
    .select('id').eq('id', req.params.id).eq('org_id', req.user.org_id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const { data: extraction } = await supabase.from('characteristic_extractions')
    .select('*, extraction_items(*)')
    .eq('document_id', req.params.id)
    .order('extracted_at', { ascending: false })
    .limit(1)
    .single();

  res.json(extraction || null);
});

// POST /api/documents/:id/extraction/approve
// Body: { control_plan_id, items: [{id, ...editedFields, status: 'approved'|'rejected'}] }
router.post('/:id/extraction/approve', requireAuth, requireRole('engineer','manager','admin'), async (req, res) => {
  const { control_plan_id, items } = req.body;
  if (!control_plan_id || !items?.length)
    return res.status(400).json({ error: 'control_plan_id and items required' });

  try {
    // Get extraction
    const { data: extraction } = await supabase.from('characteristic_extractions')
      .select('id').eq('document_id', req.params.id).single();
    if (!extraction) return res.status(404).json({ error: 'No extraction found' });

    // Get current sequence max for the control plan
    const { data: existing } = await supabase.from('characteristics')
      .select('sequence').eq('control_plan_id', control_plan_id)
      .order('sequence', { ascending: false }).limit(1);
    let seq = existing?.[0]?.sequence || 0;

    const approvedItems = items.filter(i => i.status === 'approved' || i.status === 'edited');
    const characteristics = approvedItems.map(item => {
      seq++;
      const vals = item.edited_values || item;
      return {
        control_plan_id,
        org_id: req.user.org_id,
        sequence: seq,
        name: vals.name || item.name,
        description: vals.description || item.description,
        nominal: vals.nominal ?? item.nominal,
        usl: vals.usl ?? item.usl,
        lsl: vals.lsl ?? item.lsl,
        unit: vals.unit || item.unit,
        gauge_type: vals.gauge_type || item.gauge_type,
        critical: vals.critical ?? item.critical ?? false,
        char_type: vals.char_type || item.char_type || 'variable',
        source_document_id: req.params.id,
      };
    });

    // Insert approved characteristics
    const { data: created, error: insertErr } = await supabase
      .from('characteristics').insert(characteristics).select();
    if (insertErr) throw new Error(insertErr.message);

    // Update extraction_items with characteristic_id links
    for (let i = 0; i < approvedItems.length; i++) {
      await supabase.from('extraction_items').update({
        status: items[i].status,
        characteristic_id: created[i]?.id,
        edited_values: items[i].edited_values || null
      }).eq('id', approvedItems[i].id);
    }

    // Mark rejected items
    const rejectedItems = items.filter(i => i.status === 'rejected');
    for (const item of rejectedItems) {
      await supabase.from('extraction_items').update({ status: 'rejected' }).eq('id', item.id);
    }

    // Update extraction status
    await supabase.from('characteristic_extractions').update({
      status: rejectedItems.length > 0 ? 'partially_approved' : 'approved',
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      characteristics_created: created.length
    }).eq('id', extraction.id);

    res.json({ created: created.length, characteristics: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents (list for a part or org)
router.get('/', requireAuth, async (req, res) => {
  const { part_id, control_plan_id } = req.query;
  let query = supabase.from('documents').select('*').eq('org_id', req.user.org_id);
  if (part_id) query = query.eq('part_id', part_id);
  if (control_plan_id) query = query.eq('control_plan_id', control_plan_id);
  const { data, error } = await query.order('uploaded_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
