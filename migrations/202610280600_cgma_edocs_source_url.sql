-- 청계면상인회 전자문서: 링크(구글 문서·드라이브·웹 주소)로 등록한 문서의 원문 주소.
-- Additive only. A link document is stored as a server-fetched snapshot (content_kind='file') whenever the
-- link is publicly downloadable; otherwise a 보관 document may keep the link itself as its record.
ALTER TABLE cgma_edoc_documents ADD COLUMN source_url TEXT NOT NULL DEFAULT '';

-- The source link is part of the record: it cannot be changed after the document leaves 'draft'.
CREATE TRIGGER IF NOT EXISTS trg_cgma_edoc_documents_source_locked
BEFORE UPDATE ON cgma_edoc_documents
WHEN OLD.status<>'draft' AND NEW.source_url<>OLD.source_url
BEGIN
  SELECT RAISE(ABORT,'document source link is locked after registration');
END;
