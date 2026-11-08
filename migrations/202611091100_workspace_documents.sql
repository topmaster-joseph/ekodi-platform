-- 사이트 공통 관리자 문서함(모든 운영공간): 발급서류·공식문서 목록, 이력, 만료형 공유 링크.
-- 원본 파일은 비공개 R2 workspace/{tenant}/documents/ 아래에만 저장하고 문서함 API로만 내려받는다.
-- 계좌번호 등 민감 값은 이 공개 저장소에 적지 않는다(파일·비공개 드라이브 원본에만 존재).
CREATE TABLE IF NOT EXISTS workspace_documents (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  holder TEXT NOT NULL DEFAULT '',
  issued_on TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_tenant ON workspace_documents(tenant_slug, status, doc_type, holder, issued_on DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_document_events (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workspace_document_events_doc ON workspace_document_events(tenant_slug, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workspace_document_shares (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workspace_document_shares_doc ON workspace_document_shares(tenant_slug, document_id, created_at DESC);

-- 2026.11.09 통장사본 등록: 원본은 joseph@ekodi.kr 구글드라이브 '에코디 문서함/{사이트}' 폴더(비공개).
INSERT OR IGNORE INTO workspace_documents (id,tenant_slug,doc_type,title,holder,issued_on,note,source_url,status,uploaded_by,created_at,updated_at) VALUES
('wdoc-6f1c2a4e-0b7d-4c55-9a51-20261109a001','ekodimission','통장사본','통장사본(신한은행 · 예금주 에코디선교회 정찬균)','에코디선교회','2026-11-09',
 '신한은행 보통예금 · 계좌관리점 목포대학교 · 계좌가입일 2018.11.27 · 2026.11.09 조회본(계좌번호는 원본 파일 참조)',
 'https://drive.google.com/file/d/154zJ-KZR3Rf_bxfaFpLOXNBoL3uldaJS/view','active','claude','2026-11-09T00:00:00Z','2026-11-09T00:00:00Z'),
('wdoc-6f1c2a4e-0b7d-4c55-9a51-20261109a002','cgma','통장사본','통장사본(신한은행 · 예금주 청계면상인회 정찬균)','청계면상인회','2026-11-09',
 '신한은행 보통예금 · 계좌관리점 목포대학교 · 계좌가입일 2024.07.24 · 2026.11.09 조회본(계좌번호는 원본 파일 참조)',
 'https://drive.google.com/file/d/1GsxM8oEFC7OTIEg25kRHSbruqYrxa-Eg/view','active','claude','2026-11-09T00:00:00Z','2026-11-09T00:00:00Z');

INSERT OR IGNORE INTO workspace_document_events (id,tenant_slug,document_id,action,actor,detail,created_at) VALUES
('wdev-6f1c2a4e-0b7d-4c55-9a51-20261109e001','ekodimission','wdoc-6f1c2a4e-0b7d-4c55-9a51-20261109a001','upload','claude','통장사본 2026-11-09 (드라이브 원본 링크)','2026-11-09T00:00:00Z'),
('wdev-6f1c2a4e-0b7d-4c55-9a51-20261109e002','cgma','wdoc-6f1c2a4e-0b7d-4c55-9a51-20261109a002','upload','claude','통장사본 2026-11-09 (드라이브 원본 링크)','2026-11-09T00:00:00Z');
