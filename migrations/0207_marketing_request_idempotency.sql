-- EKODI AI Social Growth Phase 7 — 게시 요청 Idempotency-Key 저장소.
-- 순수 추가(additive) 마이그레이션이다. 기존 테이블·자동 게시 의미는 바꾸지 않는다.
-- marketing-publishing-worker(/v1/publish)와 marketing-growth-worker(/v1/publish)가 같은 키로 다시 요청되면
-- 새 작업을 만들지 않고 처음 응답(작업 id 포함)을 그대로 돌려준다.
-- key는 sha256(scope + '\n' + Idempotency-Key) 16진수로, 다른 주체·엔드포인트의 같은 키와 섞이지 않는다.
-- 원문 키·공급자 토큰은 저장하지 않는다.

CREATE TABLE IF NOT EXISTS marketing_request_idempotency (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
  job_id INTEGER,
  content_id INTEGER,
  response_status INTEGER NOT NULL DEFAULT 200,
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marketing_request_idempotency_scope
  ON marketing_request_idempotency(scope, created_at);
