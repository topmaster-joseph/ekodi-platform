-- EKODIBIZ Doraji: administrator-owned draft operations ledger on the existing EKODI D1.
-- No public read/write, signatures, payment dispatch, settlement approval or automatic account posting.
-- Access is enforced in the canonical Worker using an authenticated EKODI admin session
-- and per-project role. No bootstrap administrator or cross-project public grants.
CREATE TABLE IF NOT EXISTS doraji_projects (
  id TEXT PRIMARY KEY,
  owner_admin_id INTEGER NOT NULL REFERENCES admins(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  region TEXT NOT NULL DEFAULT '',
  greenhouse_count INTEGER NOT NULL DEFAULT 0 CHECK(greenhouse_count BETWEEN 0 AND 100000),
  area_sqm REAL NOT NULL DEFAULT 0 CHECK(area_sqm BETWEEN 0 AND 100000000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','planning','cultivation','harvest','closed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doraji_projects_owner ON doraji_projects(owner_admin_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS doraji_project_roles (
  project_id TEXT NOT NULL REFERENCES doraji_projects(id) ON DELETE CASCADE,
  admin_id INTEGER NOT NULL REFERENCES admins(id),
  role TEXT NOT NULL CHECK(role IN ('viewer','editor')),
  granted_by_admin_id INTEGER NOT NULL REFERENCES admins(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id,admin_id)
);

CREATE TABLE IF NOT EXISTS doraji_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES doraji_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('cultivation','budget','contract','delivery','document')),
  record_date TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 2000),
  quantity_kg REAL NOT NULL DEFAULT 0 CHECK(quantity_kg BETWEEN 0 AND 1000000000),
  amount_krw INTEGER NOT NULL DEFAULT 0 CHECK(amount_krw BETWEEN 0 AND 9000000000000000),
  counterparty TEXT NOT NULL DEFAULT '' CHECK(length(counterparty) <= 160),
  reference TEXT NOT NULL DEFAULT '' CHECK(length(reference) <= 240),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state='draft'),
  version INTEGER NOT NULL DEFAULT 1,
  author_admin_id INTEGER NOT NULL REFERENCES admins(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doraji_records_project_kind ON doraji_records(project_id,kind,record_date DESC);
CREATE INDEX IF NOT EXISTS idx_doraji_records_author ON doraji_records(author_admin_id,created_at DESC);

CREATE TABLE IF NOT EXISTS doraji_audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES doraji_projects(id) ON DELETE CASCADE,
  actor_admin_id INTEGER NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL CHECK(action IN ('project_created','project_updated','record_created','record_updated')),
  resource_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doraji_audit_project ON doraji_audit_events(project_id,created_at DESC);
