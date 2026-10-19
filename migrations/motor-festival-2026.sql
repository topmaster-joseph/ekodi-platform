-- Apply to a dedicated D1 database before enabling the API.
CREATE TABLE IF NOT EXISTS motor_festival_2026_applications (
 id TEXT PRIMARY KEY,
 created_at TEXT NOT NULL,
 business_name TEXT NOT NULL,
 contact_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 category TEXT NOT NULL,
 membership TEXT NOT NULL CHECK (membership IN ('regular','join','info','none')),
 intent TEXT NOT NULL CHECK (intent IN ('yes','maybe','no')),
 activity TEXT NOT NULL,
 items TEXT NOT NULL,
 hours TEXT NOT NULL,
 support TEXT NOT NULL,
 staff TEXT NOT NULL,
 notes TEXT NOT NULL,
 expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_motor_festival_2026_created ON motor_festival_2026_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motor_festival_2026_expiry ON motor_festival_2026_applications(expires_at);
-- Schedule deletion after the stated retention period; this index does not delete data.
