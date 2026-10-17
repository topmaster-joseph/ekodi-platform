-- EKODI Research owns these tables in a separately provisioned, isolated D1 database.
-- Apply only after explicit release/database provisioning review.
CREATE TABLE IF NOT EXISTS research_projects (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 title TEXT NOT NULL,
 field TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL DEFAULT 'thesis' CHECK (kind IN ('thesis','journal','report')),
 stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','literature','design','analysis','writing','submission')),
 next_step TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS research_projects_owner ON research_projects(owner_id,updated_at);
CREATE TABLE IF NOT EXISTS research_consultations (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 service TEXT NOT NULL CHECK (service IN ('diagnosis','methodology','coaching','manuscript_review')),
 topic TEXT NOT NULL,
 preferred_time TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','reviewing','scheduled','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS research_consultations_owner ON research_consultations(owner_id,created_at);
