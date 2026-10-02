-- Hide the obsolete pre-reconciliation 2026-09-21 system seed.
-- The canonical replacement is seed-bidaewee-20260921.
UPDATE seonammedi_timeline
SET status='draft', updated_at=CURRENT_TIMESTAMP
WHERE legacy_key='seed-020'
  AND created_by='system-seed'
  AND event_date='2026.09.21';
