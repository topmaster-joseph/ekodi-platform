-- EKODI local-region operating-rights ledger
-- Additive: durable current assignment state + immutable audit events.

CREATE TABLE IF NOT EXISTS local_region_operator_assignments (
  region_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  operator_tenant_slug TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lead_operator','co_operator','reviewer','publisher','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','handover','suspended','revoked')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  assigned_by TEXT NOT NULL DEFAULT 'system',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (region_id, module_id, operator_id)
);

CREATE INDEX IF NOT EXISTS idx_local_region_operator_assignments_region_status
  ON local_region_operator_assignments(region_id, status);

CREATE INDEX IF NOT EXISTS idx_local_region_operator_assignments_operator
  ON local_region_operator_assignments(operator_tenant_slug, status);

CREATE TABLE IF NOT EXISTS local_region_operator_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  region_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'assigned','co_operator_added','role_changed','transfer_started',
    'transfer_completed','suspended','reactivated','revoked'
  )),
  from_role TEXT NOT NULL DEFAULT '',
  to_role TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  event_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_region_operator_events_region_time
  ON local_region_operator_events(region_id, event_at DESC);

INSERT OR IGNORE INTO local_region_operator_assignments
(region_id,module_id,operator_id,operator_tenant_slug,role,status,effective_from,effective_to,assigned_by,note,created_at,updated_at)
VALUES
('local:cheonggye','directory','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','commerce','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','commerce-pass','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','events','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','jobs','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','sharing','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','broadcast','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z'),
('local:cheonggye','proposals','cgma','cgma','lead_operator','active','2026-09-21T00:00:00.000Z',NULL,'system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z');

INSERT OR IGNORE INTO local_region_operator_events
(event_key,region_id,module_id,operator_id,event_type,from_role,to_role,actor_email,reason,event_at)
VALUES
('seed:local:cheonggye:directory:cgma','local:cheonggye','directory','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:commerce:cgma','local:cheonggye','commerce','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:commerce-pass:cgma','local:cheonggye','commerce-pass','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:events:cgma','local:cheonggye','events','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:jobs:cgma','local:cheonggye','jobs','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:sharing:cgma','local:cheonggye','sharing','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:broadcast:cgma','local:cheonggye','broadcast','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z'),
('seed:local:cheonggye:proposals:cgma','local:cheonggye','proposals','cgma','assigned','','lead_operator','system','청계면상인회 초기 주 운영권','2026-09-21T00:00:00.000Z');
