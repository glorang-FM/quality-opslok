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
