-- 문서보관 문서별 첨부 원본(통장사본·증명서 등 PDF/이미지). 파일은 비공개 R2(CHURCH_DOCUMENT_FILES)에 두고 여기에는 위치만 기록한다.
-- 제출서류 '전체 인쇄(PDF 묶음)'에서 편집 문서와 함께 순서대로 인쇄된다.
CREATE TABLE IF NOT EXISTS church_document_attachments (
  doc_id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_at TEXT NOT NULL
);
