-- EKODI Service Demand Radar
-- Aggregate unmet service needs without storing requester identity or raw event history.
CREATE TABLE IF NOT EXISTS service_demands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_key TEXT NOT NULL UNIQUE,
  intent TEXT NOT NULL DEFAULT 'other',
  requested_capability TEXT NOT NULL,
  user_segment TEXT NOT NULL DEFAULT 'general',
  related_service_id TEXT NOT NULL DEFAULT '',
  request_count INTEGER NOT NULL DEFAULT 1,
  urgency_score INTEGER NOT NULL DEFAULT 0 CHECK (urgency_score BETWEEN 0 AND 100),
  business_value_score INTEGER NOT NULL DEFAULT 0 CHECK (business_value_score BETWEEN 0 AND 100),
  mission_fit_score INTEGER NOT NULL DEFAULT 0 CHECK (mission_fit_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','planned','integrating','launched','declined','archived')),
  implementation_type TEXT NOT NULL DEFAULT '' CHECK (implementation_type IN ('','existing','new','external')),
  admin_note TEXT NOT NULL DEFAULT '',
  first_requested_at TEXT NOT NULL,
  last_requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by INTEGER,
  FOREIGN KEY (reviewed_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_service_demands_status_priority
  ON service_demands(status, request_count DESC, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_demands_intent
  ON service_demands(intent, last_requested_at DESC);
