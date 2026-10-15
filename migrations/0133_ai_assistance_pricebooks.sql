-- EKODIBIZ publicly approved fixed standard-price list.
-- Append-only approval history: no PG order, tax invoice, customer signature or payment authority.
CREATE TABLE IF NOT EXISTS ai_assistance_pricebooks (
  id TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL UNIQUE,
  items_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status='approved'),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  CHECK(length(policy_version) BETWEEN 6 AND 64),
  CHECK(length(items_json) BETWEEN 100 AND 8000)
);
CREATE INDEX IF NOT EXISTS idx_ai_assistance_pricebooks_latest
ON ai_assistance_pricebooks(status,approved_at DESC);
CREATE TRIGGER IF NOT EXISTS ai_assistance_pricebooks_no_update
BEFORE UPDATE ON ai_assistance_pricebooks
BEGIN
  SELECT RAISE(ABORT,'approved_pricebook_is_immutable');
END;
CREATE TRIGGER IF NOT EXISTS ai_assistance_pricebooks_no_delete
BEFORE DELETE ON ai_assistance_pricebooks
BEGIN
  SELECT RAISE(ABORT,'approved_pricebook_is_immutable');
END;
