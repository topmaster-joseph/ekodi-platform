-- 에코디교회 문서보관 · 발급서류(건강보험료 납부확인서, 소득금액증명, 통장사본 등)
-- 원본 파일은 R2(church/ekodichurch/issued/) 비공개 보관, 목회자 관리자 인증 후에만 내려받기.
-- 같은 종류는 가장 최근 발급분을 '최근서류'로 표시하고, 이전 파일은 이력으로 남긴다.
CREATE TABLE IF NOT EXISTS church_issued_documents (
  id TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  holder TEXT NOT NULL DEFAULT '',
  issued_on TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_church_issued_documents_type ON church_issued_documents(status, doc_type, holder, issued_on DESC, created_at DESC);
