-- BOOKS-GUEST-OTP-001 — guest buyer email challenges/sessions, dormant until digital-goods MID approval.
-- No matching by unhashed email across the EKODI member identity ledger.
CREATE TABLE IF NOT EXISTS books_guest_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_books_guest_challenges_email ON books_guest_challenges(email_hash,created_at);
CREATE INDEX IF NOT EXISTS idx_books_guest_challenges_ip ON books_guest_challenges(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS books_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_guest_sessions_buyer ON books_guest_sessions(buyer_id,expires_at);
