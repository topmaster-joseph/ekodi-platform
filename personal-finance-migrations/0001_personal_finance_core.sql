PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal_finance_profiles (
  id TEXT PRIMARY KEY, owner_subject TEXT NOT NULL UNIQUE, base_currency TEXT NOT NULL DEFAULT 'KRW', timezone TEXT NOT NULL DEFAULT 'Asia/Seoul', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_finance_accounts (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, account_type TEXT NOT NULL CHECK(account_type IN ('CASH','BANK','CARD','SAVINGS','INVESTMENT','LOAN','INSURANCE','OTHER')), balance_role TEXT NOT NULL CHECK(balance_role IN ('asset','liability')), institution_name TEXT NOT NULL DEFAULT '', account_alias TEXT NOT NULL, last4 TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'KRW', current_balance INTEGER NOT NULL DEFAULT 0 CHECK(current_balance >= 0), balance_as_of TEXT, source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','CSV','OPEN_BANKING','CARD_API')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_accounts_profile ON personal_finance_accounts(profile_id, active, account_alias);

CREATE TABLE IF NOT EXISTS personal_finance_categories (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer')), name TEXT NOT NULL, normalized_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE, UNIQUE(profile_id, kind, normalized_name)
);

CREATE TABLE IF NOT EXISTS personal_finance_import_batches (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, account_id TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'CSV', source_label TEXT NOT NULL DEFAULT '', row_count INTEGER NOT NULL DEFAULT 0, imported_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'COMMITTED', created_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES personal_finance_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_import_batches_profile ON personal_finance_import_batches(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS personal_finance_transactions (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, account_id TEXT NOT NULL, transaction_date TEXT NOT NULL, posted_at TEXT, direction TEXT NOT NULL CHECK(direction IN ('INFLOW','OUTFLOW','TRANSFER')), amount INTEGER NOT NULL CHECK(amount >= 0), currency TEXT NOT NULL DEFAULT 'KRW', merchant_original TEXT NOT NULL DEFAULT '', merchant_normalized TEXT NOT NULL DEFAULT '', category_id TEXT, memo TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','CSV','OPEN_BANKING','CARD_API')), source_reference TEXT NOT NULL DEFAULT '', import_batch_id TEXT, duplicate_fingerprint TEXT NOT NULL DEFAULT '', ai_category TEXT NOT NULL DEFAULT '', ai_confidence REAL, user_confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES personal_finance_accounts(id) ON DELETE CASCADE, FOREIGN KEY(category_id) REFERENCES personal_finance_categories(id), FOREIGN KEY(import_batch_id) REFERENCES personal_finance_import_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_pf_transactions_profile_date ON personal_finance_transactions(profile_id, transaction_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_pf_transactions_account_date ON personal_finance_transactions(account_id, transaction_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_pf_transactions_fingerprint ON personal_finance_transactions(profile_id, duplicate_fingerprint);

CREATE TABLE IF NOT EXISTS personal_finance_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_audit_profile_time ON personal_finance_audit_events(profile_id, created_at DESC);
