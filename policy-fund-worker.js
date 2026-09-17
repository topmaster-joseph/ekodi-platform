import authWorker from './auth-worker.js';
import {
  POLICY_APPLICATION_STATUSES,
  POLICY_CASE_STATUSES,
  POLICY_DOCUMENT_STATUSES,
  POLICY_ELIGIBILITY_STATUSES,
  POLICY_EXTENSION_KINDS,
  POLICY_LOAN_STATUSES,
  POLICY_TASK_STATUSES,
  isoDate,
  money,
  officialSource,
  oneOf,
  nextPolicyMilestones,
} from './policy-fund-domain.js';

const ALLOWED_ORIGINS = new Set([
  'https://ekodi.kr',
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr',
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, baseHeaders = null, origin = '') {
  const headers = new Headers(baseHeaders || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  for (const [key, value] of corsHeaders(origin).entries()) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function nullableDate(value) {
  if (value === null || value === undefined || value === '') return null;
  return isoDate(value);
}

function uuid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function validHttpsUrl(value) {
  try { return new URL(String(value)).protocol === 'https:'; } catch { return false; }
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session.email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function borrowers(env) {
  const result = await env.DB.prepare(`SELECT id,display_name AS displayName,organization_id AS organizationId,
      business_unit_id AS businessUnitId,borrower_kind AS borrowerKind,active,notes,updated_at AS updatedAt
    FROM finance_policy_borrowers ORDER BY active DESC,display_name`).all();
  return (result.results || []).map(row => ({ ...row, active: Boolean(row.active) }));
}

async function resolveBorrower(env, body) {
  const borrowerId = text(body?.borrowerId, 120);
  if (borrowerId) {
    const row = await env.DB.prepare(`SELECT id,organization_id AS organizationId,business_unit_id AS businessUnitId
      FROM finance_policy_borrowers WHERE id=? AND active=1`).bind(borrowerId).first();
    if (!row) throw new Error('INVALID_BORROWER');
    return row;
  }
  const organizationId = text(body?.organizationId, 80);
  if (!organizationId) throw new Error('INVALID_BORROWER');
  const row = await env.DB.prepare(`SELECT id,organization_id AS organizationId,business_unit_id AS businessUnitId
    FROM finance_policy_borrowers WHERE organization_id=? AND active=1 ORDER BY updated_at DESC LIMIT 1`).bind(organizationId).first();
  if (!row) throw new Error('INVALID_BORROWER');
  return row;
}

async function overview(env) {
  const [borrowerStats, applications, loans, extensions, tasks, documents, latest] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN active=1 THEN 1 ELSE 0 END),0) AS active
      FROM finance_policy_borrowers`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status IN ('eligible','preparing') THEN 1 ELSE 0 END),0) AS preparing,
      COALESCE(SUM(CASE WHEN status IN ('submitted','supplement') THEN 1 ELSE 0 END),0) AS submitted,
      COALESCE(SUM(CASE WHEN status IN ('approved','executed') THEN 1 ELSE 0 END),0) AS approved
      FROM finance_policy_applications`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status NOT IN ('closed','refinanced') THEN balance ELSE 0 END),0) AS active_balance,
      COALESCE(SUM(CASE WHEN status NOT IN ('closed','refinanced') AND maturity_on IS NOT NULL
        AND maturity_on BETWEEN date('now') AND date('now','+90 day') THEN 1 ELSE 0 END),0) AS due_90,
      COUNT(DISTINCT CASE WHEN status NOT IN ('closed','refinanced') THEN borrower_id END) AS borrowers_with_active_loans
      FROM finance_policy_loans`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status IN ('candidate','preparing','submitted','supplement') THEN 1 ELSE 0 END),0) AS open_cases
      FROM finance_policy_extensions`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS open,
      COALESCE(SUM(CASE WHEN status='open' AND due_on < date('now') THEN 1 ELSE 0 END),0) AS overdue,
      COALESCE(SUM(CASE WHEN status='open' AND due_on BETWEEN date('now') AND date('now','+14 day') THEN 1 ELSE 0 END),0) AS due_14
      FROM finance_policy_tasks WHERE status='open'`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS missing FROM finance_policy_documents
      WHERE status IN ('missing','requested','expired')`).first(),
    env.DB.prepare(`SELECT id,title,agency,program_year AS programYear,notice_number AS noticeNumber,
      revision_label AS revisionLabel,published_on AS publishedOn,source_url AS sourceUrl,source_checked_at AS sourceCheckedAt
      FROM finance_policy_programs WHERE active=1
      ORDER BY COALESCE(published_on,'') DESC,updated_at DESC LIMIT 1`).first(),
  ]);
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    borrowers: {
      total: Number(borrowerStats?.total || 0),
      active: Number(borrowerStats?.active || 0),
      withActiveLoans: Number(loans?.borrowers_with_active_loans || 0),
    },
    applications: {
      total: Number(applications?.total || 0), preparing: Number(applications?.preparing || 0),
      submitted: Number(applications?.submitted || 0), approved: Number(applications?.approved || 0),
    },
    loans: {
      total: Number(loans?.total || 0), activeBalance: Number(loans?.active_balance || 0),
      dueWithin90Days: Number(loans?.due_90 || 0),
    },
    extensions: { total: Number(extensions?.total || 0), openCases: Number(extensions?.open_cases || 0) },
    tasks: { open: Number(tasks?.open || 0), overdue: Number(tasks?.overdue || 0), dueWithin14Days: Number(tasks?.due_14 || 0) },
    documents: { missing: Number(documents?.missing || 0) },
    latestOfficialProgram: latest ? { ...latest, officialSource: officialSource(latest.sourceUrl) } : null,
  };
}

async function programs(env) {
  const result = await env.DB.prepare(`SELECT id,title,agency,program_year AS programYear,notice_number AS noticeNumber,
    revision_label AS revisionLabel,published_on AS publishedOn,application_open_on AS applicationOpenOn,
    application_close_on AS applicationCloseOn,source_url AS sourceUrl,source_checked_at AS sourceCheckedAt,
    terms_json AS termsJson,active,updated_at AS updatedAt
    FROM finance_policy_programs ORDER BY active DESC,program_year DESC,COALESCE(published_on,'') DESC`).all();
  return (result.results || []).map(row => ({ ...row, active:Boolean(row.active), officialSource:officialSource(row.sourceUrl) }));
}

async function portfolio(env, filters = {}) {
  const borrowerId = text(filters.borrowerId, 120);
  const organizationId = text(filters.organizationId, 80);
  let borrowerFilter = borrowerId;
  if (!borrowerFilter && organizationId) {
    const row = await env.DB.prepare('SELECT id FROM finance_policy_borrowers WHERE organization_id=? AND active=1 LIMIT 1').bind(organizationId).first();
    borrowerFilter = row?.id || '__not_found__';
  }
  const where = borrowerFilter ? ' WHERE borrower_id=?' : '';
  const bind = statement => borrowerFilter ? statement.bind(borrowerFilter) : statement;
  const [applicationRows, loanRows, taskRows, borrowerRows] = await Promise.all([
    bind(env.DB.prepare(`SELECT a.id,a.borrower_id AS borrowerId,b.display_name AS borrowerName,a.organization_id AS organizationId,
      a.business_unit_id AS businessUnitId,a.program_id AS programId,p.title AS programTitle,a.status,
      a.eligibility_status AS eligibilityStatus,a.eligibility_reason AS eligibilityReason,a.requested_amount AS requestedAmount,
      a.approved_amount AS approvedAmount,a.next_action AS nextAction,a.next_action_due AS nextActionDue,
      a.submitted_at AS submittedAt,a.decided_at AS decidedAt,a.notes,a.updated_at AS updatedAt
      FROM finance_policy_applications a JOIN finance_policy_borrowers b ON b.id=a.borrower_id
      JOIN finance_policy_programs p ON p.id=a.program_id${where.replace('borrower_id','a.borrower_id')}
      ORDER BY COALESCE(a.next_action_due,'9999-12-31'),a.updated_at DESC LIMIT 200`)).all(),
    bind(env.DB.prepare(`SELECT l.id,l.application_id AS applicationId,l.borrower_id AS borrowerId,b.display_name AS borrowerName,
      l.organization_id AS organizationId,l.business_unit_id AS businessUnitId,l.lender,l.product_name AS productName,
      l.guarantee_agency AS guaranteeAgency,l.loan_type AS loanType,l.principal,l.balance,l.annual_rate AS annualRate,
      l.repayment_method AS repaymentMethod,l.payment_day AS paymentDay,l.monthly_payment AS monthlyPayment,
      l.started_on AS startedOn,l.grace_end_on AS graceEndOn,l.maturity_on AS maturityOn,l.status,l.source_url AS sourceUrl,
      l.notes,l.updated_at AS updatedAt FROM finance_policy_loans l JOIN finance_policy_borrowers b ON b.id=l.borrower_id${where.replace('borrower_id','l.borrower_id')}
      ORDER BY COALESCE(l.maturity_on,'9999-12-31'),l.updated_at DESC LIMIT 200`)).all(),
    bind(env.DB.prepare(`SELECT t.id,t.borrower_id AS borrowerId,b.display_name AS borrowerName,t.organization_id AS organizationId,
      t.application_id AS applicationId,t.loan_id AS loanId,t.extension_id AS extensionId,t.task_type AS taskType,t.title,
      t.due_on AS dueOn,t.status,t.priority,t.notes,t.updated_at AS updatedAt
      FROM finance_policy_tasks t JOIN finance_policy_borrowers b ON b.id=t.borrower_id${where.replace('borrower_id','t.borrower_id')}
      ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END,COALESCE(t.due_on,'9999-12-31') LIMIT 300`)).all(),
    borrowerFilter
      ? env.DB.prepare(`SELECT id,display_name AS displayName,organization_id AS organizationId,business_unit_id AS businessUnitId,
          borrower_kind AS borrowerKind,active,notes,updated_at AS updatedAt FROM finance_policy_borrowers WHERE id=?`).bind(borrowerFilter).all()
      : env.DB.prepare(`SELECT id,display_name AS displayName,organization_id AS organizationId,business_unit_id AS businessUnitId,
          borrower_kind AS borrowerKind,active,notes,updated_at AS updatedAt FROM finance_policy_borrowers ORDER BY display_name`).all(),
  ]);
  const loans = (loanRows.results || []).map(loan => ({ ...loan, milestones:nextPolicyMilestones(loan.maturityOn) }));
  const loanIds = loans.map(item => item.id);
  let extensions = [];
  if (loanIds.length) {
    const placeholders = loanIds.map(() => '?').join(',');
    const result = await env.DB.prepare(`SELECT id,loan_id AS loanId,kind,eligibility_status AS eligibilityStatus,status,
      requested_on AS requestedOn,decided_on AS decidedOn,original_maturity_on AS originalMaturityOn,
      new_maturity_on AS newMaturityOn,reason,source_url AS sourceUrl,notes,updated_at AS updatedAt
      FROM finance_policy_extensions WHERE loan_id IN (${placeholders}) ORDER BY updated_at DESC`).bind(...loanIds).all();
    extensions = result.results || [];
  }
  return {
    borrowerId: borrowerFilter && borrowerFilter !== '__not_found__' ? borrowerFilter : null,
    borrowers: (borrowerRows.results || []).map(row => ({ ...row,active:Boolean(row.active) })),
    applications: applicationRows.results || [], loans, extensions, tasks: taskRows.results || [],
  };
}

async function upsertBorrower(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120) || uuid('borrower');
  const displayName = text(body?.displayName,180);
  if (!displayName) throw new Error('INVALID_BORROWER');
  await env.DB.prepare(`INSERT INTO finance_policy_borrowers
    (id,display_name,organization_id,business_unit_id,borrower_kind,active,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,organization_id=excluded.organization_id,
      business_unit_id=excluded.business_unit_id,borrower_kind=excluded.borrower_kind,active=excluded.active,
      notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,displayName,text(body?.organizationId,80)||null,text(body?.businessUnitId,80)||null,
      text(body?.borrowerKind,80)||'business',body?.active===false?0:1,text(body?.notes,1000),now,now).run();
  return id;
}

async function upsertProgram(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120) || uuid('program');
  const title = text(body?.title,240);
  const year = Math.trunc(Number(body?.programYear));
  const sourceUrl = text(body?.sourceUrl,1000);
  if (!title || !Number.isInteger(year) || year < 2000 || year > 2100 || !validHttpsUrl(sourceUrl)) throw new Error('INVALID_PROGRAM');
  await env.DB.prepare(`INSERT INTO finance_policy_programs
    (id,title,agency,program_year,notice_number,revision_label,published_on,application_open_on,application_close_on,
     source_url,source_checked_at,terms_json,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,agency=excluded.agency,program_year=excluded.program_year,
      notice_number=excluded.notice_number,revision_label=excluded.revision_label,published_on=excluded.published_on,
      application_open_on=excluded.application_open_on,application_close_on=excluded.application_close_on,
      source_url=excluded.source_url,source_checked_at=excluded.source_checked_at,terms_json=excluded.terms_json,
      active=excluded.active,updated_at=excluded.updated_at`)
    .bind(id,title,text(body?.agency,180),year,text(body?.noticeNumber,120),text(body?.revisionLabel,80),nullableDate(body?.publishedOn),
      nullableDate(body?.applicationOpenOn),nullableDate(body?.applicationCloseOn),sourceUrl,body?.sourceCheckedAt||now,
      JSON.stringify(body?.terms||{}),body?.active===false?0:1,now,now).run();
  return id;
}

async function upsertApplication(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120) || uuid('application');
  const borrower = await resolveBorrower(env,body);
  const programId = text(body?.programId,120);
  if (!programId) throw new Error('INVALID_APPLICATION');
  const requested = body?.requestedAmount === null || body?.requestedAmount === undefined || body?.requestedAmount === '' ? null : money(body.requestedAmount);
  const approved = body?.approvedAmount === null || body?.approvedAmount === undefined || body?.approvedAmount === '' ? null : money(body.approvedAmount);
  if ((body?.requestedAmount !== undefined && body?.requestedAmount !== '' && requested===null) ||
      (body?.approvedAmount !== undefined && body?.approvedAmount !== '' && approved===null)) throw new Error('INVALID_AMOUNT');
  await env.DB.prepare(`INSERT INTO finance_policy_applications
    (id,borrower_id,organization_id,business_unit_id,program_id,status,eligibility_status,eligibility_reason,requested_amount,
     approved_amount,next_action,next_action_due,submitted_at,decided_at,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET borrower_id=excluded.borrower_id,organization_id=excluded.organization_id,
      business_unit_id=excluded.business_unit_id,program_id=excluded.program_id,status=excluded.status,
      eligibility_status=excluded.eligibility_status,eligibility_reason=excluded.eligibility_reason,
      requested_amount=excluded.requested_amount,approved_amount=excluded.approved_amount,next_action=excluded.next_action,
      next_action_due=excluded.next_action_due,submitted_at=excluded.submitted_at,decided_at=excluded.decided_at,
      notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,borrower.id,borrower.organizationId||null,text(body?.businessUnitId,80)||borrower.businessUnitId||null,programId,
      oneOf(body?.status,POLICY_APPLICATION_STATUSES,'discovered'),oneOf(body?.eligibilityStatus,POLICY_ELIGIBILITY_STATUSES,'unknown'),
      text(body?.eligibilityReason,1000),requested,approved,text(body?.nextAction,500),nullableDate(body?.nextActionDue),
      body?.submittedAt||null,body?.decidedAt||null,text(body?.notes,2000),now,now).run();
  return id;
}

async function upsertLoan(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120) || uuid('loan');
  const borrower = await resolveBorrower(env,body);
  const principal = money(body?.principal);
  const balance = body?.balance === undefined || body?.balance === '' ? principal : money(body?.balance);
  if (principal===null || balance===null) throw new Error('INVALID_LOAN');
  const rate = body?.annualRate === null || body?.annualRate === undefined || body?.annualRate === '' ? null : Number(body.annualRate);
  if (rate!==null && (!Number.isFinite(rate) || rate<0 || rate>100)) throw new Error('INVALID_RATE');
  const paymentDay = body?.paymentDay === null || body?.paymentDay === undefined || body?.paymentDay === '' ? null : Math.trunc(Number(body.paymentDay));
  if (paymentDay!==null && (!Number.isInteger(paymentDay) || paymentDay<1 || paymentDay>31)) throw new Error('INVALID_PAYMENT_DAY');
  const monthlyPayment = body?.monthlyPayment === null || body?.monthlyPayment === undefined || body?.monthlyPayment === '' ? null : money(body.monthlyPayment);
  if (body?.monthlyPayment !== undefined && body?.monthlyPayment !== '' && monthlyPayment===null) throw new Error('INVALID_AMOUNT');
  const sourceUrl = text(body?.sourceUrl,1000)||null;
  if (sourceUrl && !validHttpsUrl(sourceUrl)) throw new Error('INVALID_SOURCE_URL');
  await env.DB.prepare(`INSERT INTO finance_policy_loans
    (id,application_id,borrower_id,organization_id,business_unit_id,lender,product_name,guarantee_agency,loan_type,
     principal,balance,annual_rate,repayment_method,payment_day,monthly_payment,started_on,grace_end_on,maturity_on,
     status,source_url,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET application_id=excluded.application_id,borrower_id=excluded.borrower_id,
      organization_id=excluded.organization_id,business_unit_id=excluded.business_unit_id,lender=excluded.lender,
      product_name=excluded.product_name,guarantee_agency=excluded.guarantee_agency,loan_type=excluded.loan_type,
      principal=excluded.principal,balance=excluded.balance,annual_rate=excluded.annual_rate,
      repayment_method=excluded.repayment_method,payment_day=excluded.payment_day,monthly_payment=excluded.monthly_payment,
      started_on=excluded.started_on,grace_end_on=excluded.grace_end_on,maturity_on=excluded.maturity_on,status=excluded.status,
      source_url=excluded.source_url,notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,text(body?.applicationId,120)||null,borrower.id,borrower.organizationId||null,
      text(body?.businessUnitId,80)||borrower.businessUnitId||null,text(body?.lender,180),text(body?.productName,240),
      text(body?.guaranteeAgency,180),text(body?.loanType,80)||'existing-loan',principal,balance,rate,
      text(body?.repaymentMethod,120),paymentDay,monthlyPayment,nullableDate(body?.startedOn),nullableDate(body?.graceEndOn),
      nullableDate(body?.maturityOn),oneOf(body?.status,POLICY_LOAN_STATUSES,'active'),sourceUrl,text(body?.notes,2000),now,now).run();
  return id;
}

async function upsertExtension(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120)||uuid('extension');
  const loanId = text(body?.loanId,120);
  if (!loanId) throw new Error('INVALID_EXTENSION');
  const sourceUrl = text(body?.sourceUrl,1000)||null;
  if (sourceUrl && !validHttpsUrl(sourceUrl)) throw new Error('INVALID_SOURCE_URL');
  await env.DB.prepare(`INSERT INTO finance_policy_extensions
    (id,loan_id,kind,eligibility_status,status,requested_on,decided_on,original_maturity_on,new_maturity_on,reason,source_url,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET loan_id=excluded.loan_id,kind=excluded.kind,eligibility_status=excluded.eligibility_status,
      status=excluded.status,requested_on=excluded.requested_on,decided_on=excluded.decided_on,
      original_maturity_on=excluded.original_maturity_on,new_maturity_on=excluded.new_maturity_on,reason=excluded.reason,
      source_url=excluded.source_url,notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,loanId,oneOf(body?.kind,POLICY_EXTENSION_KINDS,'other'),oneOf(body?.eligibilityStatus,POLICY_ELIGIBILITY_STATUSES,'unknown'),
      oneOf(body?.status,POLICY_CASE_STATUSES,'candidate'),nullableDate(body?.requestedOn),nullableDate(body?.decidedOn),
      nullableDate(body?.originalMaturityOn),nullableDate(body?.newMaturityOn),text(body?.reason,1500),sourceUrl,text(body?.notes,2000),now,now).run();
  return id;
}

async function upsertTask(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120)||uuid('task');
  const borrower = await resolveBorrower(env,body);
  const title = text(body?.title,500);
  if (!title) throw new Error('INVALID_TASK');
  await env.DB.prepare(`INSERT INTO finance_policy_tasks
    (id,borrower_id,organization_id,application_id,loan_id,extension_id,task_type,title,due_on,status,priority,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET borrower_id=excluded.borrower_id,organization_id=excluded.organization_id,
      application_id=excluded.application_id,loan_id=excluded.loan_id,extension_id=excluded.extension_id,
      task_type=excluded.task_type,title=excluded.title,due_on=excluded.due_on,status=excluded.status,
      priority=excluded.priority,notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,borrower.id,borrower.organizationId||null,text(body?.applicationId,120)||null,text(body?.loanId,120)||null,
      text(body?.extensionId,120)||null,text(body?.taskType,80)||'follow-up',title,nullableDate(body?.dueOn),
      oneOf(body?.status,POLICY_TASK_STATUSES,'open'),oneOf(body?.priority,['low','normal','high','urgent'],'normal'),
      text(body?.notes,2000),now,now).run();
  return id;
}

async function upsertDocument(env, body) {
  const now = new Date().toISOString();
  const id = text(body?.id,120)||uuid('document');
  const name = text(body?.name,300);
  const documentType = text(body?.documentType,100);
  if (!name || !documentType || (!body?.applicationId && !body?.extensionId)) throw new Error('INVALID_DOCUMENT');
  await env.DB.prepare(`INSERT INTO finance_policy_documents
    (id,application_id,extension_id,document_type,name,status,issued_on,expires_on,storage_ref,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET application_id=excluded.application_id,extension_id=excluded.extension_id,
      document_type=excluded.document_type,name=excluded.name,status=excluded.status,issued_on=excluded.issued_on,
      expires_on=excluded.expires_on,storage_ref=excluded.storage_ref,notes=excluded.notes,updated_at=excluded.updated_at`)
    .bind(id,text(body?.applicationId,120)||null,text(body?.extensionId,120)||null,documentType,name,
      oneOf(body?.status,POLICY_DOCUMENT_STATUSES,'missing'),nullableDate(body?.issuedOn),nullableDate(body?.expiresOn),
      text(body?.storageRef,1000)||null,text(body?.notes,2000),now,now).run();
  return id;
}

const MUTATIONS = new Map([
  ['/api/finance/policy-funds/borrowers',['finance.policy.borrower.upsert',upsertBorrower]],
  ['/api/finance/policy-funds/programs',['finance.policy.program.upsert',upsertProgram]],
  ['/api/finance/policy-funds/applications',['finance.policy.application.upsert',upsertApplication]],
  ['/api/finance/policy-funds/loans',['finance.policy.loan.upsert',upsertLoan]],
  ['/api/finance/policy-funds/extensions',['finance.policy.extension.upsert',upsertExtension]],
  ['/api/finance/policy-funds/tasks',['finance.policy.task.upsert',upsertTask]],
  ['/api/finance/policy-funds/documents',['finance.policy.document.upsert',upsertDocument]],
]);

export default {
  async fetch(request,env) {
    const origin = request.headers.get('origin')||'';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error:'허용되지 않은 요청입니다.' },403,null,origin);
    if (request.method==='OPTIONS') return new Response(null,{ status:204,headers:corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method==='GET' && url.pathname==='/api/finance/policy-funds/health') {
      return json({ ok:true,service:'ekodi-policy-fund-management',version:2 },200,null,origin);
    }
    if (!env?.DB) return json({ error:'D1 데이터베이스 연결이 없습니다.' },503,null,origin);
    const auth = await sessionCheck(request,env);
    if (!auth.session) return auth.response;
    try {
      if (request.method==='GET' && url.pathname==='/api/finance/policy-funds/overview') {
        return json(await overview(env),200,auth.response.headers,origin);
      }
      if (request.method==='GET' && url.pathname==='/api/finance/policy-funds/borrowers') {
        return json({ borrowers:await borrowers(env) },200,auth.response.headers,origin);
      }
      if (request.method==='GET' && url.pathname==='/api/finance/policy-funds/programs') {
        return json({ programs:await programs(env) },200,auth.response.headers,origin);
      }
      if (request.method==='GET' && url.pathname==='/api/finance/policy-funds/portfolio') {
        return json(await portfolio(env,{ borrowerId:url.searchParams.get('borrowerId')||'',organizationId:url.searchParams.get('organizationId')||'' }),200,auth.response.headers,origin);
      }
      if ((request.method==='POST' || request.method==='PUT') && MUTATIONS.has(url.pathname)) {
        const body = await readJson(request);
        if (!body) return json({ error:'유효한 JSON이 필요합니다.' },400,auth.response.headers,origin);
        const [action,handler] = MUTATIONS.get(url.pathname);
        const id = await handler(env,body);
        await audit(env,auth.session,action,id,JSON.stringify({ borrowerId:body.borrowerId||null,organizationId:body.organizationId||null,status:body.status||null }));
        return json({ ok:true,id },request.method==='POST'?201:200,auth.response.headers,origin);
      }
      return json({ error:'정책자금·대출관리 API 경로를 찾을 수 없습니다.' },404,auth.response.headers,origin);
    } catch (error) {
      const code = String(error?.message||'POLICY_FUND_ERROR');
      const clientError = code.startsWith('INVALID_');
      return json({ error:clientError?'입력값을 확인해 주세요.':'정책자금·대출관리 처리 중 오류가 발생했습니다.',code },clientError?400:500,auth.response.headers,origin);
    }
  }
};
