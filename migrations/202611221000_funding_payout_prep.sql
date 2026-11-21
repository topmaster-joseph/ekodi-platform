-- EKODI-FUNDING-008 — 2단계 준비: 정산지급대행 셀러 정보와 정산 기록. Additive only.
-- 계좌번호 전체는 저장하지 않는다(토스로 바로 전달, 끝 4자리만 account_masked 에 남김).
CREATE TABLE IF NOT EXISTS funding_payout_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  ref_seller_id TEXT NOT NULL UNIQUE,
  seller_id TEXT,
  seller_status TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  business_type TEXT NOT NULL CHECK (business_type IN ('INDIVIDUAL','INDIVIDUAL_BUSINESS','CORPORATE')),
  display_name TEXT NOT NULL DEFAULT '',
  bank_code TEXT NOT NULL DEFAULT '',
  account_masked TEXT NOT NULL DEFAULT '' CHECK (length(account_masked) <= 8),
  holder_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funding_settlements (
  campaign_id TEXT PRIMARY KEY,
  ref_payout_id TEXT NOT NULL UNIQUE,
  seller_id TEXT NOT NULL,
  gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0 AND gross_amount < 10000000),
  fee_bp INTEGER NOT NULL CHECK (fee_bp >= 0 AND fee_bp <= 3000),
  fee_amount INTEGER NOT NULL CHECK (fee_amount >= 0),
  net_amount INTEGER NOT NULL CHECK (net_amount >= 0 AND net_amount <= gross_amount),
  status TEXT NOT NULL DEFAULT 'requesting' CHECK (status IN ('requesting','requested','completed','failed','canceled')),
  payout_id TEXT,
  payout_status TEXT,
  error TEXT,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
