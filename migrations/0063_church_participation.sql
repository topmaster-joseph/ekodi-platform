-- EKODI Church Participation & Care
-- Attendance is stored as factual participation data. Care signals are derived at read time
-- and remain subject to human pastoral review rather than becoming permanent labels.

CREATE TABLE IF NOT EXISTS church_gatherings (
  id TEXT PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  gathering_kind TEXT NOT NULL DEFAULT 'worship',
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  location_label TEXT NOT NULL DEFAULT '',
  checkin_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (gathering_kind IN ('worship','prayer','fellowship','education','mission','service','other')),
  CHECK (status IN ('open','closed','cancelled')),
  FOREIGN KEY (tenant_id) REFERENCES customer_tenants(id),
  FOREIGN KEY (created_by) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS church_participants (
  id TEXT PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  participant_kind TEXT NOT NULL DEFAULT 'guest',
  subject_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (participant_kind IN ('member','guest')),
  CHECK (status IN ('active','inactive')),
  FOREIGN KEY (tenant_id) REFERENCES customer_tenants(id)
);

CREATE TABLE IF NOT EXISTS church_attendance (
  id TEXT PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  gathering_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'onsite',
  source TEXT NOT NULL DEFAULT 'self',
  checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (channel IN ('onsite','online','hybrid')),
  CHECK (source IN ('self','admin')),
  UNIQUE (gathering_id, participant_id),
  FOREIGN KEY (tenant_id) REFERENCES customer_tenants(id),
  FOREIGN KEY (gathering_id) REFERENCES church_gatherings(id),
  FOREIGN KEY (participant_id) REFERENCES church_participants(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_participants_subject
  ON church_participants(tenant_id, subject_hash)
  WHERE subject_hash <> '';
CREATE INDEX IF NOT EXISTS idx_church_gatherings_tenant_start
  ON church_gatherings(tenant_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_gatherings_status
  ON church_gatherings(tenant_id, status, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_church_attendance_gathering
  ON church_attendance(tenant_id, gathering_id, checked_in_at);
CREATE INDEX IF NOT EXISTS idx_church_attendance_participant
  ON church_attendance(tenant_id, participant_id, checked_in_at DESC);
