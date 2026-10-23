-- 청계면 도시재생 주민협의체(cgmurrc) 행사 부스 근무 분담 — 회원별 개인 링크.
-- 개인 링크 토큰은 원문을 저장하지 않고 SHA-256 해시만 저장한다.
-- 회원은 자기 토큰으로 자기 행만 바꿀 수 있고(서버가 토큰에서 회원을 결정), 확정은 협의체 관리자만 한다.
-- 저장하는 개인정보는 이름뿐이며 연락처는 받지 않는다. 행사 30일 뒤 정리 대상.
CREATE TABLE IF NOT EXISTS cgmurrc_booth_members (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT UNIQUE,
  token_issued_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgmurrc_booth_members_event
  ON cgmurrc_booth_members(event,active,sort_order);

CREATE TABLE IF NOT EXISTS cgmurrc_booth_entries (
  event TEXT NOT NULL,
  member_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 7),
  status TEXT NOT NULL CHECK (status IN ('assigned','requested','drop_requested')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event,member_id,slot)
);
CREATE INDEX IF NOT EXISTS idx_cgmurrc_booth_entries_event
  ON cgmurrc_booth_entries(event,slot);

CREATE TABLE IF NOT EXISTS cgmurrc_booth_audit (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  member_id TEXT,
  slot INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgmurrc_booth_audit_event
  ON cgmurrc_booth_audit(event,created_at);
