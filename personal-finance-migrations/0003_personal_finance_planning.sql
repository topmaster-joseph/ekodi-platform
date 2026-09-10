PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal_finance_settings (
  profile_id TEXT PRIMARY KEY,
  minimum_reserve INTEGER NOT NULL DEFAULT 0 CHECK(minimum_reserve >= 0),
  safe_to_spend_window_days INTEGER NOT NULL DEFAULT 30 CHECK(safe_to_spend_window_days BETWEEN 1 AND 90),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_finance_recurring_rules (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('INFLOW','OUTFLOW')),
  amount INTEGER NOT NULL CHECK(amount > 0),
  frequency TEXT NOT NULL CHECK(frequency IN ('WEEKLY','MONTHLY','YEARLY','ONE_TIME')),
  next_due_date TEXT NOT NULL,
  essential INTEGER NOT NULL DEFAULT 1 CHECK(essential IN (0,1)),
  source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','DETECTED')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES personal_finance_accounts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pf_recurring_profile_due ON personal_finance_recurring_rules(profile_id,active,next_due_date);

CREATE TABLE IF NOT EXISTS personal_finance_budgets (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category_id TEXT,
  limit_amount INTEGER NOT NULL CHECK(limit_amount > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY(category_id) REFERENCES personal_finance_categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pf_budgets_profile ON personal_finance_budgets(profile_id,active,name);

CREATE TABLE IF NOT EXISTS personal_finance_goals (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK(goal_type IN ('SAVINGS','DEBT_REPAYMENT','RESERVE','PURCHASE','OTHER')),
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK(target_amount > 0),
  current_amount INTEGER NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
  target_date TEXT,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES personal_finance_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pf_goals_profile ON personal_finance_goals(profile_id,active,priority,target_date);