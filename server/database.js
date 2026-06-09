const bcrypt = require('bcryptjs');
const { db } = require('./db-adapter');

async function initSchema() {
  // ── Core multi-tenant tables ──────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'inspector',
      created_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, email)
    )
  `);

  // ── Billing columns on organizations (dormant until BILLING_ENFORCED=true) ──
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_sub_id TEXT`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'trial'`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sub_status TEXT DEFAULT 'trialing'`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paid_through DATE`);
  await db.run(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS allowed_domain TEXT`);

  // ── Inspection templates — reusable checklists ───────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS inspection_templates (
      id          SERIAL PRIMARY KEY,
      org_id      INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      category    TEXT,
      items       TEXT NOT NULL DEFAULT '[]',
      active      INTEGER NOT NULL DEFAULT 1,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Inspections — a run of a template (or ad-hoc) ────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS inspections (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      template_id   INTEGER REFERENCES inspection_templates(id) ON DELETE SET NULL,
      title         TEXT NOT NULL,
      category      TEXT,
      location      TEXT,
      batch_number  TEXT,
      inspector_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status        TEXT NOT NULL DEFAULT 'open',
      result        TEXT,
      notes         TEXT,
      started_at    TIMESTAMP,
      completed_at  TIMESTAMP,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Inspection items — individual checklist steps ────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS inspection_items (
      id            SERIAL PRIMARY KEY,
      inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      step_order    INTEGER NOT NULL DEFAULT 0,
      description   TEXT NOT NULL,
      result        TEXT NOT NULL DEFAULT 'pending',
      notes         TEXT,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Non-conformance reports ───────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS ncrs (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      inspection_id INTEGER REFERENCES inspections(id) ON DELETE SET NULL,
      ncr_number    TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT,
      severity      TEXT NOT NULL DEFAULT 'minor',
      status        TEXT NOT NULL DEFAULT 'open',
      assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date      DATE,
      root_cause    TEXT,
      notes         TEXT,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, ncr_number)
    )
  `);

  // ── Corrective actions on NCRs ────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS corrective_actions (
      id           SERIAL PRIMARY KEY,
      ncr_id       INTEGER NOT NULL REFERENCES ncrs(id) ON DELETE CASCADE,
      description  TEXT NOT NULL,
      assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date     DATE,
      status       TEXT NOT NULL DEFAULT 'pending',
      completed_at TIMESTAMP,
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Push notification subscriptions ──────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint     TEXT NOT NULL,
      subscription TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(endpoint)
    )
  `);

  // ── Invoices (super-admin) ────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id             SERIAL PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      org_id         INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      sent_to        TEXT NOT NULL,
      rate           NUMERIC(10,2) NOT NULL,
      discount_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
      subtotal       NUMERIC(10,2) NOT NULL,
      total          NUMERIC(10,2) NOT NULL,
      period_label   TEXT,
      notes          TEXT,
      line_items     TEXT,
      email_status   TEXT DEFAULT 'sent',
      email_error    TEXT,
      internal_notes TEXT,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Parts master ─────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS parts (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      part_number  TEXT NOT NULL,
      description  TEXT,
      revision     TEXT NOT NULL DEFAULT 'A',
      created_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE(org_id, part_number, revision)
    )
  `);

  // ── Quality: Suppliers ────────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id            SERIAL PRIMARY KEY,
      org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      code          TEXT,
      contact_email TEXT,
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Gauges ───────────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS gauges (
      id               SERIAL PRIMARY KEY,
      org_id           INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      type             TEXT,
      serial_number    TEXT,
      calibration_due  DATE,
      status           TEXT NOT NULL DEFAULT 'current'
                         CHECK (status IN ('current','overdue','out_for_cal','retired')),
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Control plans ────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS control_plans (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      part_id         INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
      inspection_type TEXT NOT NULL DEFAULT 'incoming'
                        CHECK (inspection_type IN ('incoming','inprocess','preshipment','final')),
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','superseded')),
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Characteristics (what to measure on a control plan) ──────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS characteristics (
      id                 SERIAL PRIMARY KEY,
      control_plan_id    INTEGER NOT NULL REFERENCES control_plans(id) ON DELETE CASCADE,
      name               TEXT NOT NULL,
      description        TEXT,
      char_type          TEXT NOT NULL DEFAULT 'variable'
                           CHECK (char_type IN ('variable','attribute')),
      nominal            NUMERIC(18,6),
      usl                NUMERIC(18,6),
      lsl                NUMERIC(18,6),
      unit               TEXT,
      gauge_id           INTEGER REFERENCES gauges(id) ON DELETE SET NULL,
      critical           BOOLEAN NOT NULL DEFAULT FALSE,
      source_document_id INTEGER,
      step_order         INTEGER NOT NULL DEFAULT 0,
      created_at         TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Documents (uploaded specs / drawings for AI parsing) ──────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id           SERIAL PRIMARY KEY,
      org_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      part_id      INTEGER REFERENCES parts(id) ON DELETE SET NULL,
      filename     TEXT,
      file_url     TEXT,
      mime_type    TEXT,
      parse_status TEXT NOT NULL DEFAULT 'pending'
                     CHECK (parse_status IN ('pending','processing','complete','failed','skipped')),
      uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  // FK back-patch so characteristics can reference documents
  await db.run(`
    ALTER TABLE characteristics
      ADD COLUMN IF NOT EXISTS source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL
  `);

  // ── Quality: AI extraction results ───────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS characteristic_extractions (
      id             SERIAL PRIMARY KEY,
      document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      ai_model       TEXT,
      raw_ai_output  TEXT,
      status         TEXT NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review','approved','partially_approved','rejected')),
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS extraction_items (
      id              SERIAL PRIMARY KEY,
      extraction_id   INTEGER NOT NULL REFERENCES characteristic_extractions(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      char_type       TEXT NOT NULL DEFAULT 'variable',
      nominal         NUMERIC(18,6),
      usl             NUMERIC(18,6),
      lsl             NUMERIC(18,6),
      unit            TEXT,
      gauge_type      TEXT,
      critical        BOOLEAN NOT NULL DEFAULT FALSE,
      ai_confidence   TEXT NOT NULL DEFAULT 'medium'
                        CHECK (ai_confidence IN ('high','medium','low')),
      ai_notes        TEXT,
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','edited','rejected')),
      characteristic_id INTEGER REFERENCES characteristics(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: Inspection orders (measurement-based) ────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS inspection_orders (
      id              SERIAL PRIMARY KEY,
      org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      order_number    TEXT NOT NULL,
      part_id         INTEGER NOT NULL REFERENCES parts(id),
      control_plan_id INTEGER REFERENCES control_plans(id) ON DELETE SET NULL,
      supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      inspection_type TEXT NOT NULL DEFAULT 'incoming'
                        CHECK (inspection_type IN ('incoming','inprocess','preshipment','final')),
      lot_size        INTEGER,
      sample_size     INTEGER,
      status          TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','complete','on_hold','cancelled')),
      result          TEXT CHECK (result IN ('pass','fail','conditional_pass')),
      assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes           TEXT,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT NOW(),
      completed_at    TIMESTAMP,
      UNIQUE(org_id, order_number)
    )
  `);

  // ── Quality: Readings (the actual measurement data) ───────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS readings (
      id                  SERIAL PRIMARY KEY,
      inspection_order_id INTEGER NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
      characteristic_id   INTEGER NOT NULL REFERENCES characteristics(id) ON DELETE CASCADE,
      technician_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sample_number       INTEGER NOT NULL DEFAULT 1,
      actual_value        TEXT NOT NULL,
      in_spec             BOOLEAN NOT NULL,
      deviation           NUMERIC(18,6),
      notes               TEXT,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Quality: NCR ↔ readings link ──────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS ncr_readings (
      ncr_id     INTEGER NOT NULL REFERENCES ncrs(id) ON DELETE CASCADE,
      reading_id INTEGER NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
      PRIMARY KEY (ncr_id, reading_id)
    )
  `);

  // ── Quality: NCR extra columns ────────────────────────────────────────────
  await db.run(`ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS part_id INTEGER REFERENCES parts(id) ON DELETE SET NULL`);
  await db.run(`ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL`);
  await db.run(`ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS inspection_order_id INTEGER REFERENCES inspection_orders(id) ON DELETE SET NULL`);
  await db.run(`ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT 'pending'`);

  // ── Quality: CAPAs ────────────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS capas (
      id                   SERIAL PRIMARY KEY,
      org_id               INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      ncr_id               INTEGER REFERENCES ncrs(id) ON DELETE SET NULL,
      immediate_action     TEXT,
      why_1                TEXT,
      why_2                TEXT,
      why_3                TEXT,
      why_4                TEXT,
      why_5                TEXT,
      corrective_action    TEXT,
      effectiveness_criteria TEXT,
      effectiveness_date   DATE,
      status               TEXT NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','in_progress','pending_verification','closed','voided')),
      assigned_to          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at           TIMESTAMP DEFAULT NOW(),
      closed_at            TIMESTAMP
    )
  `);

  // Seed: if no orgs exist, create default org + admin
  const orgCheck = await db.one('SELECT COUNT(*) as count FROM organizations');
  if (!orgCheck || parseInt(orgCheck.count) === 0) {
    const org = await db.one(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
      ['Overture Air Quality', 'overture']
    );
    const hash = await bcrypt.hash('admin123', 10);
    await db.run(
      `INSERT INTO users (org_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
      [org.id, 'Admin', 'admin@opslok.com', hash, 'manager']
    );
    console.log('Default org "Overture Air Quality" and admin created: admin@opslok.com / admin123');
  }

  console.log('Quality OpsLok schema initialized.');
}

module.exports = { initSchema };
