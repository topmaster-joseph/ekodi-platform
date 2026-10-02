-- Schema columns are repaired idempotently by ensurePublicContentSchema before use.
-- Keep this migration as a durable deployment ledger marker because earlier staging
-- requests may already have added the columns before D1 records this migration.
SELECT 1;
