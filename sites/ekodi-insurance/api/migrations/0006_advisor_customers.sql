CREATE TABLE IF NOT EXISTS insurance_advisor_admin_users (
  advisor_profile_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'advisor',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (advisor_profile_id, user_email),
  FOREIGN KEY (advisor_profile_id) REFERENCES insurance_advisor_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_advisor_admin_email
  ON insurance_advisor_admin_users(user_email, status);

CREATE TABLE IF NOT EXISTS insurance_advisor_customers (
  id TEXT PRIMARY KEY,
  advisor_profile_id TEXT NOT NULL,
  affiliation_id TEXT,
  insurer_name TEXT NOT NULL DEFAULT '',
  customer_label TEXT NOT NULL,
  contact_ciphertext TEXT,
  contact_hint TEXT NOT NULL DEFAULT '',
  product_category TEXT NOT NULL DEFAULT 'general',
  policy_status TEXT NOT NULL DEFAULT 'active',
  effective_date TEXT,
  review_date TEXT,
  consent_at TEXT,
  consent_source TEXT NOT NULL DEFAULT 'advisor-recorded-with-customer-consent',
  note TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (advisor_profile_id) REFERENCES insurance_advisor_profiles(id),
  FOREIGN KEY (affiliation_id) REFERENCES insurance_advisor_affiliations(id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_advisor_customers_scope
  ON insurance_advisor_customers(advisor_profile_id, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_advisor_customers_review
  ON insurance_advisor_customers(advisor_profile_id, review_date, policy_status);

CREATE TABLE IF NOT EXISTS insurance_advisor_customer_audit (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  advisor_profile_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES insurance_advisor_customers(id),
  FOREIGN KEY (advisor_profile_id) REFERENCES insurance_advisor_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_advisor_customer_audit_scope
  ON insurance_advisor_customer_audit(advisor_profile_id, created_at DESC);
