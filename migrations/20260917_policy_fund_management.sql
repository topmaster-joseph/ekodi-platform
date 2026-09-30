-- EKODI Finance / Small-business policy fund and existing-loan management
-- Additive migration: borrowers -> programs/applications -> loans -> extensions/documents/tasks.
-- Financial account numbers and credentials are intentionally excluded from this ledger.

CREATE TABLE IF NOT EXISTS finance_policy_borrowers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  organization_id TEXT,
  business_unit_id TEXT,
  borrower_kind TEXT NOT NULL DEFAULT 'business',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_policy_programs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agency TEXT NOT NULL DEFAULT '',
  program_year INTEGER NOT NULL,
  notice_number TEXT NOT NULL DEFAULT '',
  revision_label TEXT NOT NULL DEFAULT '',
  published_on TEXT,
  application_open_on TEXT,
  application_close_on TEXT,
  source_url TEXT NOT NULL,
  source_checked_at TEXT,
  terms_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_policy_applications (
  id TEXT PRIMARY KEY,
  borrower_id TEXT NOT NULL,
  organization_id TEXT,
  business_unit_id TEXT,
  program_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered',
  eligibility_status TEXT NOT NULL DEFAULT 'unknown',
  eligibility_reason TEXT NOT NULL DEFAULT '',
  requested_amount INTEGER,
  approved_amount INTEGER,
  next_action TEXT NOT NULL DEFAULT '',
  next_action_due TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(borrower_id) REFERENCES finance_policy_borrowers(id),
  FOREIGN KEY(program_id) REFERENCES finance_policy_programs(id)
);

CREATE TABLE IF NOT EXISTS finance_policy_loans (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  borrower_id TEXT NOT NULL,
  organization_id TEXT,
  business_unit_id TEXT,
  lender TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  guarantee_agency TEXT NOT NULL DEFAULT '',
  loan_type TEXT NOT NULL DEFAULT 'existing-loan',
  principal INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  annual_rate REAL,
  repayment_method TEXT NOT NULL DEFAULT '',
  payment_day INTEGER CHECK(payment_day IS NULL OR (payment_day BETWEEN 1 AND 31)),
  monthly_payment INTEGER,
  started_on TEXT,
  grace_end_on TEXT,
  maturity_on TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id) REFERENCES finance_policy_applications(id),
  FOREIGN KEY(borrower_id) REFERENCES finance_policy_borrowers(id)
);

CREATE TABLE IF NOT EXISTS finance_policy_extensions (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'candidate',
  requested_on TEXT,
  decided_on TEXT,
  original_maturity_on TEXT,
  new_maturity_on TEXT,
  reason TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(loan_id) REFERENCES finance_policy_loans(id)
);

CREATE TABLE IF NOT EXISTS finance_policy_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  extension_id TEXT,
  document_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing',
  issued_on TEXT,
  expires_on TEXT,
  storage_ref TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id) REFERENCES finance_policy_applications(id),
  FOREIGN KEY(extension_id) REFERENCES finance_policy_extensions(id)
);

CREATE TABLE IF NOT EXISTS finance_policy_tasks (
  id TEXT PRIMARY KEY,
  borrower_id TEXT NOT NULL,
  organization_id TEXT,
  application_id TEXT,
  loan_id TEXT,
  extension_id TEXT,
  task_type TEXT NOT NULL DEFAULT 'follow-up',
  title TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(borrower_id) REFERENCES finance_policy_borrowers(id),
  FOREIGN KEY(application_id) REFERENCES finance_policy_applications(id),
  FOREIGN KEY(loan_id) REFERENCES finance_policy_loans(id),
  FOREIGN KEY(extension_id) REFERENCES finance_policy_extensions(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_policy_borrowers_org
  ON finance_policy_borrowers(active, organization_id, display_name);
CREATE INDEX IF NOT EXISTS idx_finance_policy_programs_active_year
  ON finance_policy_programs(active, program_year, published_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_applications_borrower_status
  ON finance_policy_applications(borrower_id, status, next_action_due);
CREATE INDEX IF NOT EXISTS idx_finance_policy_loans_borrower_maturity
  ON finance_policy_loans(borrower_id, status, maturity_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_extensions_loan_status
  ON finance_policy_extensions(loan_id, status, new_maturity_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_documents_application
  ON finance_policy_documents(application_id, status, expires_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_tasks_borrower_due
  ON finance_policy_tasks(borrower_id, status, due_on);

CREATE TRIGGER IF NOT EXISTS trg_finance_policy_loan_maturity_insert
AFTER INSERT ON finance_policy_loans
WHEN NEW.maturity_on IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO finance_policy_tasks
    (id,borrower_id,organization_id,loan_id,task_type,title,due_on,status,priority,notes,created_at,updated_at)
  VALUES
    (NEW.id || ':d90',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-90 · 연장·대환 가능성 사전점검',date(NEW.maturity_on,'-90 day'),'open','normal','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d60',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-60 · 연장·대환 요건 및 서류 확인',date(NEW.maturity_on,'-60 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d30',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-30 · 신청 또는 상환계획 확정',date(NEW.maturity_on,'-30 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d14',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-14 · 접수·보완 상태 최종 확인',date(NEW.maturity_on,'-14 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d7',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-7 · 실행·상환 일정 최종 확인',date(NEW.maturity_on,'-7 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_finance_policy_loan_maturity_update
AFTER UPDATE OF maturity_on,borrower_id,organization_id ON finance_policy_loans
WHEN NEW.maturity_on IS NOT NULL
BEGIN
  INSERT INTO finance_policy_tasks
    (id,borrower_id,organization_id,loan_id,task_type,title,due_on,status,priority,notes,created_at,updated_at)
  VALUES
    (NEW.id || ':d90',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-90 · 연장·대환 가능성 사전점검',date(NEW.maturity_on,'-90 day'),'open','normal','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d60',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-60 · 연장·대환 요건 및 서류 확인',date(NEW.maturity_on,'-60 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d30',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-30 · 신청 또는 상환계획 확정',date(NEW.maturity_on,'-30 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d14',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-14 · 접수·보완 상태 최종 확인',date(NEW.maturity_on,'-14 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d7',NEW.borrower_id,NEW.organization_id,NEW.id,'maturity','대출 만기 D-7 · 실행·상환 일정 최종 확인',date(NEW.maturity_on,'-7 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET
    borrower_id=excluded.borrower_id,
    organization_id=excluded.organization_id,
    due_on=excluded.due_on,
    priority=excluded.priority,
    updated_at=excluded.updated_at;
END;

INSERT OR IGNORE INTO finance_policy_borrowers
  (id,display_name,organization_id,business_unit_id,borrower_kind,active,notes,created_at,updated_at)
VALUES
  ('borrower-ekodibiz','에코디비즈','EKODIBIZ',NULL,'internal-business',1,'현재 대출 운영관리 대상. 실제 대출 조건은 확인 후 등록.','2026-09-17T05:24:00Z','2026-09-17T05:24:00Z'),
  ('borrower-jadam-chicken','자담치킨',NULL,NULL,'store',1,'현재 대출 운영관리 대상. EKODI 조직/매장 식별자는 확인 후 연결. 실제 대출 조건은 확인 후 등록.','2026-09-17T05:24:00Z','2026-09-17T05:24:00Z');

INSERT OR IGNORE INTO finance_policy_programs
  (id,title,agency,program_year,notice_number,revision_label,published_on,source_url,source_checked_at,terms_json,active,created_at,updated_at)
VALUES
  ('mss-2026-small-business-policy-loans',
   '2026년 중소벤처기업부 소상공인 정책자금 융자사업',
   '중소벤처기업부 · 소상공인시장진흥공단',
   2026,
   '제2026-478호',
   '변경4차',
   '2026-07-30',
   'https://www.mss.go.kr/site/smba/ex/bbs/View.do?bcIdx=1070197&cbIdx=310',
   '2026-09-17T05:24:00Z',
   '{"sourcePolicy":"official-source-of-truth","notice":"조건·접수기간·예산소진 여부는 신청 직전 공식 공고 재확인"}',
   1,
   '2026-09-17T05:24:00Z',
   '2026-09-17T05:24:00Z');
