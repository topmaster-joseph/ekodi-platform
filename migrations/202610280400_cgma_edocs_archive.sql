-- 청계면상인회 전자문서: 보관(기록 전용) 문서, 원문서 일자, 출처 메모.
-- Additive only. mode='sign' keeps the existing sequential-signing behaviour; mode='archive' records an
-- important document (회의록·결산·계획서 등) without signatures and finalizes it as a permanent record.
ALTER TABLE cgma_edoc_documents ADD COLUMN mode TEXT NOT NULL DEFAULT 'sign';
ALTER TABLE cgma_edoc_documents ADD COLUMN doc_date TEXT NOT NULL DEFAULT '';
ALTER TABLE cgma_edoc_documents ADD COLUMN source_note TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_cgma_edoc_documents_created ON cgma_edoc_documents(workspace_id,created_at,id);

-- Signer rows of a document that has not started yet carry no signature and may be re-planned
-- (draft signer list edit). Once a document leaves 'draft', signer rows are never deleted.
DROP TRIGGER IF EXISTS trg_cgma_edoc_signers_no_delete;
CREATE TRIGGER IF NOT EXISTS trg_cgma_edoc_signers_no_delete
BEFORE DELETE ON cgma_edoc_signers
WHEN COALESCE((SELECT status FROM cgma_edoc_documents WHERE id=OLD.doc_id),'')<>'draft'
BEGIN
  SELECT RAISE(ABORT,'cgma_edoc_signers are never physically deleted');
END;
