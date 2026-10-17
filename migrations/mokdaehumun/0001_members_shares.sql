-- Mokdaehumun cooperative: execute against the tenant's private D1 database only.
-- Do not store resident registration numbers.
CREATE TABLE IF NOT EXISTS mokdaehumun_members (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 phone_ciphertext TEXT,
 address_ciphertext TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','withdrawn')),
 joined_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mokdaehumun_share_entries (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES mokdaehumun_members(id),
 entry_type TEXT NOT NULL CHECK(entry_type IN ('pledge','payment','refund','adjustment')),
 amount_krw INTEGER NOT NULL CHECK(amount_krw >= 0),
 evidence_ref TEXT,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mokdaehumun_share_member ON mokdaehumun_share_entries(member_id,created_at);
CREATE TABLE IF NOT EXISTS mokdaehumun_audit (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 target_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mokdaehumun_admin_roles (admin_id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('owner','manager')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
