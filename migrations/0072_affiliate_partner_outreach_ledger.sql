ALTER TABLE affiliate_partner_programs ADD COLUMN outreach_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE affiliate_partner_programs ADD COLUMN outreach_channel TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliate_partner_programs ADD COLUMN last_outreach_at TEXT;
ALTER TABLE affiliate_partner_programs ADD COLUMN next_followup_at TEXT;
ALTER TABLE affiliate_partner_programs ADD COLUMN outreach_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_affiliate_partner_programs_outreach
  ON affiliate_partner_programs(outreach_status, next_followup_at, priority DESC);

UPDATE affiliate_partner_programs
SET outreach_status = 'sent',
    outreach_channel = 'email',
    last_outreach_at = '2026-09-08T00:36:00Z',
    next_followup_at = '2026-09-11T00:00:00Z',
    outreach_note = '2026-09-05 최초 문의 후 2026-09-08 기존 계정·11번가 딥링크/API 연동 후속 문의 발송.',
    updated_at = '2026-09-08T00:36:00Z'
WHERE program_key = 'linkprice';

UPDATE affiliate_partner_programs
SET outreach_status = 'sent',
    outreach_channel = 'email',
    last_outreach_at = '2026-09-08T00:37:00Z',
    next_followup_at = '2026-09-11T00:00:00Z',
    outreach_note = '2026-09-08 EKODI Mall 매체제휴 및 상품 딥링크/API·리포트 연동 문의 발송.',
    updated_at = '2026-09-08T00:37:00Z'
WHERE program_key = 'adpick';