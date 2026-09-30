-- EKODI durable write ingress: idempotent citizen voice persistence.
ALTER TABLE seonammedi_civic_voices ADD COLUMN submission_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_seonammedi_civic_voices_submission
ON seonammedi_civic_voices(submission_key)
WHERE submission_key <> '';
