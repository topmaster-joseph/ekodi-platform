-- 협동조합 설립서류 서명·직인 요청과 서명본 업로드(희년세상협동조합 · 열린유통협동조합).
-- 링크 토큰은 해시만 저장한다. 원본 파일은 비공개 R2 workspace/{조합 slug}/documents/coop-signatures/ 아래에만 둔다.
CREATE TABLE IF NOT EXISTS cooperative_signature_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_key TEXT NOT NULL,
  founder_id TEXT NOT NULL,
  signer_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'either' CHECK (kind IN ('signature','seal','either')),
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','uploaded','accepted','rejected','cancelled')),
  token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TEXT NOT NULL,
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  reviewed_by TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coop_signature_requests_workspace ON cooperative_signature_requests(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cooperative_signature_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coop_signature_events_request ON cooperative_signature_events(workspace_id, request_id, created_at DESC);
