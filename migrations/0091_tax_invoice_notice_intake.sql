-- EKODI Tax invoice notice intake provenance and payment reconciliation metadata.
ALTER TABLE finance_tax_invoices ADD COLUMN source_type TEXT NOT NULL DEFAULT '';
ALTER TABLE finance_tax_invoices ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE finance_tax_invoices ADD COLUMN source_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE finance_tax_invoices ADD COLUMN source_payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE finance_tax_invoices ADD COLUMN source_received_at TEXT;
ALTER TABLE finance_tax_invoices ADD COLUMN payment_due_date TEXT NOT NULL DEFAULT '';
ALTER TABLE finance_tax_invoices ADD COLUMN deduction_amount INTEGER NOT NULL DEFAULT 0 CHECK(deduction_amount >= 0);
ALTER TABLE finance_tax_invoices ADD COLUMN expected_receipt_amount INTEGER NOT NULL DEFAULT 0 CHECK(expected_receipt_amount >= 0);
ALTER TABLE finance_tax_invoices ADD COLUMN issuance_channel TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tax_invoices_source_hash
  ON finance_tax_invoices(source_hash)
  WHERE source_hash <> '';
CREATE INDEX IF NOT EXISTS idx_finance_tax_invoices_payment_due
  ON finance_tax_invoices(payment_due_date, status);
