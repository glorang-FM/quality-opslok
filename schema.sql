-- ============================================================
-- Quality OpsLok — Database Schema
-- Supabase / PostgreSQL
-- Run in Supabase: Project > SQL Editor > New query
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SHARED TABLES (used by all OpsLok apps)
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','professional','enterprise')),
  settings      JSONB NOT NULL DEFAULT '{
    "gauge_tracking": true,
    "aql_level": 1.0,
    "auto_ncr_on_fail": true,
    "require_photos_on_fail": false,
    "ncr_approval_required": false
  }',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  module        TEXT NOT NULL CHECK (module IN ('quality','maintenance','engineering','operations')),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, module)
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'technician' CHECK (role IN ('technician','engineer','manager','admin')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_teams (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

-- ============================================================
-- SUPPORT TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id),
  name          TEXT NOT NULL,
  contact_name  TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','conditional','suspended','pending')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gauges (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES teams(id),
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  serial_number     TEXT,
  manufacturer      TEXT,
  model             TEXT,
  range_min         DECIMAL,
  range_max         DECIMAL,
  resolution        DECIMAL,
  unit              TEXT,
  calibration_due   DATE,
  last_calibrated   DATE,
  calibrated_by     TEXT,
  certificate_url   TEXT,
  status            TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current','overdue','out_for_cal','retired')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PARTS & CONTROL PLANS (blueprint layer)
-- ============================================================

CREATE TABLE IF NOT EXISTS parts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id       UUID REFERENCES teams(id),
  part_number   TEXT NOT NULL,
  revision      TEXT NOT NULL DEFAULT 'A',
  description   TEXT NOT NULL,
  category      TEXT,
  unit_of_issue TEXT DEFAULT 'EA',
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, part_number, revision)
);

CREATE TABLE IF NOT EXISTS control_plans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  part_id           UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  inspection_type   TEXT NOT NULL CHECK (inspection_type IN ('incoming','inprocess','preshipment','final')),
  revision          TEXT NOT NULL DEFAULT '1',
  title             TEXT,
  aql_level         DECIMAL DEFAULT 1.0,
  sample_size       INT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded')),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  source_document   TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS characteristics (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_plan_id   UUID NOT NULL REFERENCES control_plans(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id),
  sequence          INT NOT NULL DEFAULT 1,
  name              TEXT NOT NULL,
  description       TEXT,
  nominal           DECIMAL,
  usl               DECIMAL,
  lsl               DECIMAL,
  unit              TEXT,
  gauge_id          UUID REFERENCES gauges(id),
  gauge_type        TEXT,
  measurement_method TEXT,
  sample_frequency  TEXT DEFAULT 'per lot',
  critical          BOOLEAN NOT NULL DEFAULT FALSE,
  char_type         TEXT DEFAULT 'variable' CHECK (char_type IN ('variable','attribute')),
  source_document_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS + AI EXTRACTION
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id),
  part_id         UUID REFERENCES parts(id),
  control_plan_id UUID REFERENCES control_plans(id),
  filename        TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_type       TEXT NOT NULL,
  file_size_bytes INT,
  doc_type        TEXT CHECK (doc_type IN ('drawing','control_plan','spec_sheet','ppap','certificate','other')),
  uploaded_by     UUID REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parse_status    TEXT DEFAULT 'pending' CHECK (parse_status IN ('pending','processing','complete','failed','skipped')),
  parse_error     TEXT
);

ALTER TABLE characteristics
  ADD CONSTRAINT fk_char_source_doc
  FOREIGN KEY (source_document_id) REFERENCES documents(id);

CREATE TABLE IF NOT EXISTS characteristic_extractions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id           UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  control_plan_id       UUID REFERENCES control_plans(id),
  ai_model              TEXT,
  raw_ai_output         JSONB,
  extracted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','partially_approved','rejected')),
  reviewed_by           UUID REFERENCES users(id),
  reviewed_at           TIMESTAMPTZ,
  characteristics_created INT DEFAULT 0,
  notes                 TEXT
);

CREATE TABLE IF NOT EXISTS extraction_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  extraction_id   UUID NOT NULL REFERENCES characteristic_extractions(id) ON DELETE CASCADE,
  sequence        INT NOT NULL DEFAULT 1,
  name            TEXT,
  description     TEXT,
  nominal         DECIMAL,
  usl             DECIMAL,
  lsl             DECIMAL,
  unit            TEXT,
  gauge_type      TEXT,
  critical        BOOLEAN DEFAULT FALSE,
  char_type       TEXT DEFAULT 'variable',
  ai_confidence   TEXT CHECK (ai_confidence IN ('high','medium','low')),
  ai_notes        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','edited','rejected')),
  edited_values   JSONB,
  characteristic_id UUID REFERENCES characteristics(id)
);

-- ============================================================
-- INSPECTION ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES teams(id),
  part_id           UUID NOT NULL REFERENCES parts(id),
  control_plan_id   UUID REFERENCES control_plans(id),
  supplier_id       UUID REFERENCES suppliers(id),
  inspection_type   TEXT NOT NULL CHECK (inspection_type IN ('incoming','inprocess','preshipment','final')),
  order_number      TEXT,
  po_number         TEXT,
  work_order        TEXT,
  lot_number        TEXT,
  lot_size          INT,
  sample_size       INT,
  date_received     DATE,
  date_required     DATE,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','complete','on_hold','cancelled')),
  result            TEXT CHECK (result IN ('pass','fail','conditional_pass')),
  assigned_to       UUID REFERENCES users(id),
  completed_by      UUID REFERENCES users(id),
  completed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- READINGS (core measurement data)
-- ============================================================

CREATE TABLE IF NOT EXISTS readings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_order_id   UUID NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE,
  characteristic_id     UUID NOT NULL REFERENCES characteristics(id),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  technician_id         UUID NOT NULL REFERENCES users(id),
  gauge_id              UUID REFERENCES gauges(id),
  sample_number         INT NOT NULL DEFAULT 1,
  actual_value          DECIMAL,
  attribute_result      TEXT CHECK (attribute_result IN ('pass','fail')),
  in_spec               BOOLEAN,
  deviation             DECIMAL,
  notes                 TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  file_url              TEXT NOT NULL,
  filename              TEXT,
  caption               TEXT,
  reading_id            UUID REFERENCES readings(id) ON DELETE CASCADE,
  inspection_order_id   UUID REFERENCES inspection_orders(id) ON DELETE CASCADE,
  ncr_id                UUID,
  uploaded_by           UUID REFERENCES users(id),
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NON-CONFORMANCE REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS ncrs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id               UUID REFERENCES teams(id),
  ncr_number            TEXT NOT NULL,
  inspection_order_id   UUID REFERENCES inspection_orders(id),
  part_id               UUID REFERENCES parts(id),
  supplier_id           UUID REFERENCES suppliers(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  severity              TEXT NOT NULL DEFAULT 'major'
                        CHECK (severity IN ('critical','major','minor')),
  defect_type           TEXT,
  defect_location       TEXT,
  quantity_affected     INT,
  disposition           TEXT CHECK (disposition IN ('use_as_is','rework','scrap','return_to_vendor','pending')),
  disposition_notes     TEXT,
  disposition_approved_by UUID REFERENCES users(id),
  disposition_approved_at TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','under_review','dispositioned','closed','voided')),
  assigned_to           UUID REFERENCES users(id),
  closed_by             UUID REFERENCES users(id),
  closed_at             TIMESTAMPTZ,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE photos
  ADD CONSTRAINT fk_photos_ncr
  FOREIGN KEY (ncr_id) REFERENCES ncrs(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS ncr_readings (
  ncr_id      UUID NOT NULL REFERENCES ncrs(id) ON DELETE CASCADE,
  reading_id  UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  PRIMARY KEY (ncr_id, reading_id)
);

-- ============================================================
-- CORRECTIVE & PREVENTIVE ACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS capas (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id                 UUID REFERENCES teams(id),
  ncr_id                  UUID REFERENCES ncrs(id),
  capa_number             TEXT NOT NULL,
  title                   TEXT NOT NULL,
  type                    TEXT NOT NULL DEFAULT 'corrective'
                          CHECK (type IN ('corrective','preventive')),
  root_cause              TEXT,
  why_1                   TEXT,
  why_2                   TEXT,
  why_3                   TEXT,
  why_4                   TEXT,
  why_5                   TEXT,
  immediate_action        TEXT,
  corrective_action       TEXT,
  preventive_action       TEXT,
  effectiveness_criteria  TEXT,
  effectiveness_result    TEXT,
  owner_id                UUID REFERENCES users(id),
  due_date                DATE,
  effectiveness_date      DATE,
  status                  TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','pending_verification','closed','voided')),
  closed_by               UUID REFERENCES users(id),
  closed_at               TIMESTAMPTZ,
  created_by              UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_org            ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_teams_org            ON teams(org_id);
CREATE INDEX IF NOT EXISTS idx_parts_org            ON parts(org_id);
CREATE INDEX IF NOT EXISTS idx_control_plans_part   ON control_plans(part_id);
CREATE INDEX IF NOT EXISTS idx_chars_plan           ON characteristics(control_plan_id);
CREATE INDEX IF NOT EXISTS idx_inspections_org      ON inspection_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_inspections_part     ON inspection_orders(part_id);
CREATE INDEX IF NOT EXISTS idx_inspections_assigned ON inspection_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_readings_order       ON readings(inspection_order_id);
CREATE INDEX IF NOT EXISTS idx_readings_char        ON readings(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_org             ON ncrs(org_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_assigned        ON ncrs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_capas_ncr            ON capas(ncr_id);
CREATE INDEX IF NOT EXISTS idx_capas_owner          ON capas(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_part       ON documents(part_id);
CREATE INDEX IF NOT EXISTS idx_gauges_org           ON gauges(org_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- Open items assigned to a user (powers the dashboard)
CREATE OR REPLACE VIEW vw_my_open_items AS
SELECT 'inspection' AS item_type, io.id, io.order_number AS reference,
  p.description AS title, io.status, io.date_required AS due_date, io.assigned_to AS user_id
FROM inspection_orders io JOIN parts p ON p.id = io.part_id
WHERE io.status IN ('open','in_progress')
UNION ALL
SELECT 'ncr', n.id, n.ncr_number, n.title, n.status, NULL, n.assigned_to
FROM ncrs n WHERE n.status IN ('open','under_review')
UNION ALL
SELECT 'capa', c.id, c.capa_number, c.title, c.status, c.due_date, c.owner_id
FROM capas c WHERE c.status IN ('open','in_progress','pending_verification');

-- Supplier scorecard built from real reading data
CREATE OR REPLACE VIEW vw_supplier_scorecard AS
SELECT s.id AS supplier_id, s.name AS supplier_name, s.status, s.org_id,
  COUNT(DISTINCT io.id)                                        AS total_inspections,
  COUNT(DISTINCT CASE WHEN io.result='pass' THEN io.id END)    AS passed,
  COUNT(DISTINCT CASE WHEN io.result='fail' THEN io.id END)    AS failed,
  COUNT(r.id)                                                  AS total_readings,
  SUM(CASE WHEN r.in_spec=TRUE  THEN 1 ELSE 0 END)            AS readings_in_spec,
  SUM(CASE WHEN r.in_spec=FALSE THEN 1 ELSE 0 END)            AS readings_out_of_spec,
  COUNT(DISTINCT n.id)                                         AS total_ncrs,
  COUNT(DISTINCT CASE WHEN n.status='open' THEN n.id END)      AS open_ncrs,
  CASE WHEN COUNT(r.id) > 0
    THEN ROUND(SUM(CASE WHEN r.in_spec THEN 1 ELSE 0 END)::DECIMAL / COUNT(r.id) * 100, 1)
    ELSE NULL END                                              AS in_spec_rate_pct
FROM suppliers s
LEFT JOIN inspection_orders io ON io.supplier_id = s.id
LEFT JOIN readings r ON r.inspection_order_id = io.id
LEFT JOIN ncrs n ON n.supplier_id = s.id
GROUP BY s.id, s.name, s.status, s.org_id;

-- Characteristic trend data (ready for SPC charts in phase 2)
CREATE OR REPLACE VIEW vw_characteristic_trend AS
SELECT r.characteristic_id, c.name AS characteristic_name, c.nominal, c.usl, c.lsl, c.unit,
  r.actual_value, r.in_spec, r.deviation, r.recorded_at,
  r.inspection_order_id, io.supplier_id, io.lot_number,
  p.part_number, p.description AS part_description
FROM readings r
JOIN characteristics c ON c.id = r.characteristic_id
JOIN inspection_orders io ON io.id = r.inspection_order_id
JOIN parts p ON p.id = io.part_id
WHERE r.actual_value IS NOT NULL;
