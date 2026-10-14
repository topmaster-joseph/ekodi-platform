-- D1: login-owned EKODIBIZ assistance quote/contract review requests, never payment evidence.
CREATE TABLE IF NOT EXISTS ai_assistance_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notice_id TEXT NOT NULL,
  notice_title TEXT NOT NULL,
  notice_source TEXT NOT NULL,
  notice_url TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  plans_json TEXT NOT NULL,
  amount_krw INTEGER,
  quote_required INTEGER NOT NULL DEFAULT 1,
  legal_version TEXT NOT NULL,
  merchant TEXT NOT NULL DEFAULT 'EKODIBIZ',
  state TEXT NOT NULL DEFAULT 'review_requested'
    CHECK(state IN ('review_requested','merchant_approved','contract_pending','payment_pending','payment_confirmed','in_progress','completed','cancelled')),
  scope_acknowledged_at TEXT NOT NULL,
  privacy_acknowledged_at TEXT NOT NULL,
  precontract_acknowledged_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_assistance_requests_owner ON ai_assistance_requests(user_id,created_at DESC);
-- Public/client API has no state-change or payment-confirmation capability.
