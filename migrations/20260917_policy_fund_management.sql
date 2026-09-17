-- EKODI Finance / Small-business policy fund management
-- Additive migration: programs -> applications -> loans -> extensions/documents/tasks.

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
  organization_id TEXT NOT NULL,
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
  FOREIGN KEY(program_id) REFERENCES finance_policy_programs(id)
);

CREATE TABLE IF NOT EXISTS finance_policy_loans (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  organization_id TEXT NOT NULL,
  business_unit_id TEXT,
  lender TEXT NOT NULL DEFAULT '',
  loan_type TEXT NOT NULL DEFAULT 'policy-fund',
  principal INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0,
  annual_rate REAL,
  started_on TEXT,
  grace_end_on TEXT,
  maturity_on TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  source_url TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id) REFERENCES finance_policy_applications(id)
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
  organization_id TEXT NOT NULL,
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
  FOREIGN KEY(application_id) REFERENCES finance_policy_applications(id),
  FOREIGN KEY(loan_id) REFERENCES finance_policy_loans(id),
  FOREIGN KEY(extension_id) REFERENCES finance_policy_extensions(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_policy_programs_active_year
  ON finance_policy_programs(active, program_year, published_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_applications_org_status
  ON finance_policy_applications(organization_id, status, next_action_due);
CREATE INDEX IF NOT EXISTS idx_finance_policy_loans_org_maturity
  ON finance_policy_loans(organization_id, status, maturity_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_extensions_loan_status
  ON finance_policy_extensions(loan_id, status, new_maturity_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_documents_application
  ON finance_policy_documents(application_id, status, expires_on);
CREATE INDEX IF NOT EXISTS idx_finance_policy_tasks_org_due
  ON finance_policy_tasks(organization_id, status, due_on);

CREATE TRIGGER IF NOT EXISTS trg_finance_policy_loan_maturity_insert
AFTER INSERT ON finance_policy_loans
WHEN NEW.maturity_on IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO finance_policy_tasks
    (id,organization_id,loan_id,task_type,title,due_on,status,priority,notes,created_at,updated_at)
  VALUES
    (NEW.id || ':d90',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-90 · 연장·대환 가능성 사전점검',date(NEW.maturity_on,'-90 day'),'open','normal','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d60',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-60 · 연장·대환 요건 및 서류 확인',date(NEW.maturity_on,'-60 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d30',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-30 · 신청 또는 상환계획 확정',date(NEW.maturity_on,'-30 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d14',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-14 · 접수·보완 상태 최종 확인',date(NEW.maturity_on,'-14 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d7',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-7 · 실행·상환 일정 최종 확인',date(NEW.maturity_on,'-7 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS trg_finance_policy_loan_maturity_update
AFTER UPDATE OF maturity_on,organization_id ON finance_policy_loans
WHEN NEW.maturity_on IS NOT NULL
BEGIN
  INSERT INTO finance_policy_tasks
    (id,organization_id,loan_id,task_type,title,due_on,status,priority,notes,created_at,updated_at)
  VALUES
    (NEW.id || ':d90',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-90 · 연장·대환 가능성 사전점검',date(NEW.maturity_on,'-90 day'),'open','normal','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d60',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-60 · 연장·대환 요건 및 서류 확인',date(NEW.maturity_on,'-60 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d30',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-30 · 신청 또는 상환계획 확정',date(NEW.maturity_on,'-30 day'),'open','high','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d14',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-14 · 접수·보완 상태 최종 확인',date(NEW.maturity_on,'-14 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at),
    (NEW.id || ':d7',NEW.organization_id,NEW.id,'maturity','정책자금 만기 D-7 · 실행·상환 일정 최종 확인',date(NEW.maturity_on,'-7 day'),'open','urgent','자동 생성',NEW.created_at,NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET
    organization_id=excluded.organization_id,
    due_on=excluded.due_on,
    priority=excluded.priority,
    updated_at=excluded.updated_at;
END;

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
