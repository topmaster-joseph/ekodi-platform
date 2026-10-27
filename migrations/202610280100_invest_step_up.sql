-- EKODI Invest owner second factor ("본인인증"): Google/EKODI login + knowledge factor.
-- Additive only. Clear-text phone numbers or addresses are never stored: factors hold salted
-- PBKDF2-SHA256 hashes of a normalized fragment and are seeded out-of-band, not from this repo.
CREATE TABLE IF NOT EXISTS investment_step_up_factors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('phone','address')),
  salt TEXT NOT NULL CHECK (length(salt) = 32),
  hash TEXT NOT NULL CHECK (length(hash) = 64),
  fragment_length INTEGER NOT NULL CHECK (fragment_length BETWEEN 4 AND 64),
  iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_step_up_factors_email ON investment_step_up_factors(subject_email, active);

CREATE TABLE IF NOT EXISTS investment_step_up_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  subject_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_step_up_sessions_email ON investment_step_up_sessions(subject_email, expires_at);

CREATE TABLE IF NOT EXISTS investment_step_up_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_email TEXT NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0,1)),
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_step_up_attempts_email ON investment_step_up_attempts(subject_email, ok, attempted_at);
