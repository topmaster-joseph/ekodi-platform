ALTER TABLE device_registry ADD COLUMN diagnostics_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE device_registry ADD COLUMN diagnostics_at TEXT;
ALTER TABLE device_registry ADD COLUMN profile_name TEXT NOT NULL DEFAULT '';
