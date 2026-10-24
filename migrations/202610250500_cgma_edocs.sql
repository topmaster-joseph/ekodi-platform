-- 청계면상인회(cgma) 전자문서 · 순차 전자서명 · 기록관리.
-- Additive and private: no existing CGMA membership, board, commerce or access table is modified.
-- Ownership: cgma (CGMA-owned internal documents per docs/cheonggye-execution-rules.md §1, §9).
-- Original files live in the private R2 bucket under cgma/edocs/{doc_id}/; D1 keeps the metadata,
-- the SHA-256 of the exact signed content, the signer chain and an append-only hash-chained event log.
-- Records are never physically deleted: cancellation is a status change with a recorded reason.
CREATE TABLE IF NOT EXISTS cgma_edoc_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'cgma',
  doc_no TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL CHECK (content_kind IN ('file','text')),
  body_text TEXT NOT NULL DEFAULT '',
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_mime TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  content_sha256 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft','in_progress','completed','cancelled')),
  current_seq INTEGER NOT NULL DEFAULT 0,
  signer_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgma_edoc_documents_status ON cgma_edoc_documents(workspace_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS cgma_edoc_signers (
  doc_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role_title TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting','active','signed')),
  link_token TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL DEFAULT '',
  token_expires_at TEXT NOT NULL DEFAULT '',
  signed_at TEXT NOT NULL DEFAULT '',
  signed_name TEXT NOT NULL DEFAULT '',
  signature_strokes TEXT NOT NULL DEFAULT '',
  signed_content_sha256 TEXT NOT NULL DEFAULT '',
  signature_id TEXT NOT NULL DEFAULT '',
  client_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (doc_id,seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cgma_edoc_signers_token ON cgma_edoc_signers(token_hash) WHERE token_hash<>'';

CREATE TABLE IF NOT EXISTS cgma_edoc_events (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL DEFAULT '',
  event_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cgma_edoc_events_doc ON cgma_edoc_events(doc_id,created_at,id);
