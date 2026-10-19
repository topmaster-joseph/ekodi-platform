-- Additive: citizen voices get a title (Owner request 2026-10-19). Existing rows keep '' and
-- are displayed with the first line of their body. No data is rewritten or removed.
ALTER TABLE citizen_voices_fresh ADD COLUMN title TEXT NOT NULL DEFAULT '';
