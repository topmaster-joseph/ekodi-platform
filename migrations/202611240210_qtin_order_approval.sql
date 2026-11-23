-- EKODI-QTIN-ORDER-APPROVAL-001 (2026-11-24 운영자 지시)
-- 신청 마감 후 QTM 단체 발주 전에 운영자 휴대폰 알림으로 최종 발주 승인을 받는다.
-- 요약(summary_json)에는 건수·권수·금액·도서별 수량만 담고 신청자 개인정보는 담지 않는다.
-- Additive only.
CREATE TABLE IF NOT EXISTS qtin_order_approvals (
  campaign_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | empty
  summary_json TEXT NOT NULL DEFAULT '{}',
  notice_count INTEGER NOT NULL DEFAULT 0,
  notice_next_at TEXT NOT NULL,
  notice_last_error TEXT NOT NULL DEFAULT '',
  notified_at TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qtin_order_approvals_due ON qtin_order_approvals (status, notice_next_at);
