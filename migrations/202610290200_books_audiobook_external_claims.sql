-- EKODIAN-AUDIOBOOK-EXTERNAL-CLAIMS-001
-- Staging-only migration candidate. DO NOT run on production automatically.
-- An external ebook purchase never grants an EPUB download via books_entitlements.
CREATE TABLE IF NOT EXISTS books_audiobook_external_claims (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  retailer TEXT NOT NULL CHECK (retailer IN ('upaper','google-play','amazon')),
  external_order_hmac TEXT NOT NULL,
  order_suffix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','revoked')),
  verified_by TEXT,
  verification_method TEXT,
  revoked_by TEXT,
  revocation_reason TEXT,
  rejection_reason TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, retailer, external_order_hmac)
);
CREATE INDEX IF NOT EXISTS idx_books_audio_claims_buyer ON books_audiobook_external_claims(buyer_user_id,created_at);
CREATE TABLE IF NOT EXISTS books_audiobook_external_grants (
  buyer_user_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  claim_id TEXT NOT NULL UNIQUE,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(buyer_user_id, book_id),
  FOREIGN KEY(claim_id) REFERENCES books_audiobook_external_claims(id)
);
