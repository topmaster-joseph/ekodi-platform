-- EKODI-FUNDING-001 — 에코디 펀딩 1단계 (ekodi.kr/funding). Additive only.
CREATE TABLE IF NOT EXISTS funding_campaigns (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  story TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'reward' CHECK (kind IN ('reward','donation')),
  owner_org TEXT NOT NULL DEFAULT 'member',
  organizer_user_id TEXT NOT NULL DEFAULT '',
  organizer_email TEXT NOT NULL DEFAULT '',
  organizer_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  goal_amount INTEGER NOT NULL DEFAULT 0 CHECK (goal_amount < 10000000),
  raised_amount INTEGER NOT NULL DEFAULT 0 CHECK (raised_amount >= 0 AND raised_amount < 10000000),
  backer_count INTEGER NOT NULL DEFAULT 0,
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  refund_policy TEXT NOT NULL DEFAULT '',
  rewards_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','rejected','waiting_payout','live','closed')),
  review_note TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_funding_campaigns_status ON funding_campaigns(status, created_at);

CREATE TABLE IF NOT EXISTS funding_pledges (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  reward_title TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount > 0),
  backer_name TEXT NOT NULL DEFAULT '',
  backer_email TEXT NOT NULL DEFAULT '',
  backer_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'payment_pending',
  expires_at TEXT NOT NULL,
  payment_key TEXT,
  method TEXT,
  approved_at TEXT,
  receipt_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_funding_pledges_campaign ON funding_pledges(campaign_id, status, expires_at);

CREATE TABLE IF NOT EXISTS funding_interest (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  UNIQUE (campaign_id, email)
);

CREATE TABLE IF NOT EXISTS funding_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- 첫 시범 펀딩: 에코디출판 신간 사전후원 (운영자 지시 2026-11-21). 작성 중(draft) 상태로만 넣는다.
-- '[확인필요]' 자리를 운영자가 채워야 심사 요청·승인이 가능하다(코드가 강제). 금액은 초안이며 운영자가 정한다.
INSERT OR IGNORE INTO funding_campaigns (id,slug,title,summary,story,kind,owner_org,organizer_user_id,organizer_email,organizer_name,contact_email,goal_amount,starts_on,ends_on,refund_policy,rewards_json,status,created_at,updated_at)
VALUES ('fund_pilot_publishing_2026','ekodi-publishing-new-book','에코디출판 신간 사전후원',
 '[확인필요] 신간 도서명과 한 줄 소개를 입력해 주세요.',
 '[확인필요] 에코디출판이 준비 중인 신간을 먼저 응원하고 받아 보는 사전후원입니다. 도서명, 저자, 책의 내용, 출간 일정, 후원금 사용 계획(편집·디자인·인쇄)을 입력해 주세요.',
 'reward','publishing','','joseph@ekodi.kr','에코디출판','joseph@ekodibiz.kr',3000000,'2026-12-01','2027-01-31',
 '모금 기간 안에는 언제든 후원을 취소할 수 있으며 전액 환불됩니다.
모금이 끝났을 때 목표 금액에 못 미치면 모든 결제를 취소합니다.
리워드에 하자가 있거나 안내한 일정보다 배송이 늦어지면 받은 날부터 14일 안에 반환을 신청할 수 있습니다.
이미 시중에 판매 중인 상품은 펀딩이 아니라 에코디몰 판매로 안내합니다.',
 '[{"id":"r1","title":"마음으로 후원 (리워드 없음)","description":"신간 출간을 응원하는 후원입니다. 감사 인사를 이메일로 보내 드립니다.","amount":10000,"limit":0,"delivery":"none","estimatedDelivery":""},{"id":"r2","title":"신간 종이책 1권","description":"출간 즉시 종이책 1권을 보내 드립니다.","amount":20000,"limit":0,"delivery":"physical","estimatedDelivery":"[확인필요] 출간 예정월 입력"},{"id":"r3","title":"종이책 + 저자 서명","description":"저자 서명이 담긴 종이책 1권을 보내 드립니다.","amount":30000,"limit":100,"delivery":"physical","estimatedDelivery":"[확인필요] 출간 예정월 입력"}]',
 'draft','2026-11-21T01:00:00.000Z','2026-11-21T01:00:00.000Z');
