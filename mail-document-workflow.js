// EKODI Site Mail Documents: tenant-isolated request intake and human-gated evidence documents.
// Email metadata is never legal proof of a sale. Tax invoice transmission stays in EKODI Finance.
import { mailActor, accountAccess, googleAccessForAccount } from './mail-control.js';
import { hasGoogleReadScope, listGoogleMailMessages } from './mail-google-adapter.js';

const PREFIX = '/api/mail/control/documents';
const ORIGINS = new Set(['https://ekodi.kr']);
const TYPES = new Set(['tax_invoice', 'sales_certificate']);
const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

function json(value, status = 200, origin = '') {
  const headers = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'vary':'Origin' };
  if (ORIGINS.has(origin)) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(value), { status, headers });
}
function failure(code, status = 400) { const error = new Error(code); error.code = code; error.status = status; throw error; }
function txt(value, size = 200) { return String(value ?? '').trim().slice(0, size); }
function amount(value) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0 || n > MAX_AMOUNT) failure('INVALID_AMOUNT'); return n; }
function day(value, fallback) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1 || n > 31) failure('INVALID_DAY'); return n; }
function siteDay(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(date); }
export function inCollectionWindow(start, end, date = new Date()) {
  const d = Number(siteDay(date).slice(-2));
  return d >= day(start, 20) && d <= day(end, 25);
}
export function escapeDocumentHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}
export function verifyCaseEvidence(body) {
  const counterparty = txt(body?.counterparty, 120);
  const issuerName = txt(body?.issuerName, 120);
  const period = txt(body?.salePeriod, 80);
  const evidence = txt(body?.evidenceReference, 500);
  if (!counterparty || !issuerName || !period || !evidence) failure('SALE_EVIDENCE_REQUIRED');
  if (evidence.length < 5) failure('EVIDENCE_REFERENCE_TOO_SHORT');
  const saleAmount = amount(body?.saleAmount);
  const taxAmount = amount(body?.taxAmount);
  if (taxAmount > saleAmount * 2) failure('TAX_AMOUNT_REVIEW_REQUIRED');
  return { counterparty, issuerName, period, evidence, saleAmount, taxAmount };
}
async function input(request) { try { return await request.json(); } catch { failure('INVALID_JSON'); } }
async function schema(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS mail_document_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL, account_id INTEGER NOT NULL, document_type TEXT NOT NULL CHECK(document_type IN ('tax_invoice','sales_certificate')), search_query TEXT NOT NULL, day_from INTEGER NOT NULL DEFAULT 20, day_to INTEGER NOT NULL DEFAULT 25, active INTEGER NOT NULL DEFAULT 1, last_checked_at TEXT, last_checked_kst_day TEXT, last_error TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id,account_id,document_type,search_query))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mail_document_cases (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, account_id INTEGER, rule_id INTEGER, document_type TEXT NOT NULL CHECK(document_type IN ('tax_invoice','sales_certificate')), source_type TEXT NOT NULL CHECK(source_type IN ('mail','manual')), source_message_id TEXT NOT NULL, source_from TEXT NOT NULL DEFAULT '', source_subject TEXT NOT NULL DEFAULT '', source_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(status IN ('REVIEW','APPROVED','ISSUED')), counterparty TEXT NOT NULL DEFAULT '', issuer_name TEXT NOT NULL DEFAULT '', sale_period TEXT NOT NULL DEFAULT '', sale_amount INTEGER NOT NULL DEFAULT 0, tax_amount INTEGER NOT NULL DEFAULT 0, evidence_reference TEXT NOT NULL DEFAULT '', document_no TEXT UNIQUE, approved_by TEXT, approved_at TEXT, issued_by TEXT, issued_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id,account_id,source_message_id,document_type))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mail_document_events (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, workspace_id TEXT NOT NULL, action TEXT NOT NULL, actor_email TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_mail_docs_scope ON mail_document_cases(workspace_id,created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_mail_rules_window ON mail_document_rules(active,day_from,day_to)")
  ]);
}
async function event(db, row, action, actorEmail, detail = '') {
  await db.prepare('INSERT INTO mail_document_events(case_id,workspace_id,action,actor_email,detail,created_at) VALUES(?,?,?,?,?,?)')
    .bind(row.id,row.workspace_id,action,actorEmail,txt(detail,250),new Date().toISOString()).run();
}
async function workspaceFor(request, env, slug) {
  const actor = await mailActor(request,env);
  if (!actor) failure('AUTH_REQUIRED',401);
  const site = actor.contexts.find(c => c.workspaceSlug === slug && c.canManage);
  if (!site) failure('WORKSPACE_FINANCE_FORBIDDEN',403);
  return {actor,site};
}
async function ruleFor(db, id, site) {
  const row=await db.prepare('SELECT * FROM mail_document_rules WHERE id=? AND workspace_id=?').bind(id,site.workspaceId).first();
  if (!row) failure('RULE_NOT_FOUND',404);
  return row;
}
async function caseFor(db, id, site) {
  const row=await db.prepare('SELECT * FROM mail_document_cases WHERE id=? AND workspace_id=?').bind(id,site.workspaceId).first();
  if (!row) failure('DOCUMENT_NOT_FOUND',404);
  return row;
}
async function syncRule(db, env, rule) {
  const account=await db.prepare("SELECT * FROM mail_accounts WHERE id=? AND owner_type='workspace' AND owner_key=? AND enabled=1").bind(rule.account_id,rule.workspace_id).first();
  if (!account || account.provider!=='gmail' || account.connection_status!=='connected') failure('GMAIL_NOT_CONNECTED',409);
  const oauth=await googleAccessForAccount(env,db,account);
  if (!hasGoogleReadScope(oauth.scopes)) failure('MAIL_READ_SCOPE_REQUIRED',409);
  // Gmail results are untrusted requests, never a trigger for automatic financial issuance.
  const messages=await listGoogleMailMessages(oauth.accessToken,{q:rule.search_query,maxResults:30});
  let inserted=0;
  const now=new Date().toISOString();
  for(const message of messages.messages || []) {
    if (!/^[A-Za-z0-9_-]{5,128}$/.test(String(message.id||''))) continue;
    const id=crypto.randomUUID();
    const result=await db.prepare("INSERT OR IGNORE INTO mail_document_cases(id,workspace_id,account_id,rule_id,document_type,source_type,source_message_id,source_from,source_subject,source_date,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'mail',?,?,?,?,'REVIEW','ekodi-mail-scheduler',?,?)")
      .bind(id,rule.workspace_id,rule.account_id,rule.id,rule.document_type,message.id,txt(message.from,250),txt(message.subject,350),txt(message.date,100),now,now).run();
    if (Number(result.meta?.changes||0)>0) {
      inserted++;
      await event(db,{id,workspace_id:rule.workspace_id},'mail.request.detected','ekodi-mail-scheduler','sender-verification-and-evidence-review-required');
    }
  }
  await db.prepare("UPDATE mail_document_rules SET last_checked_at=?,last_checked_kst_day=?,last_error='',updated_at=? WHERE id=? AND workspace_id=?")
    .bind(now,siteDay(),now,rule.id,rule.workspace_id).run();
  return {scanned:(messages.messages||[]).length,inserted};
}
export async function runMailDocumentsSchedule(env) {
  if (!env?.DB) return {scannedRules:0,reason:'DB_UNAVAILABLE'};
  await schema(env.DB);
  const today=siteDay();
  const activeDay=Number(today.slice(-2));
  const rules=await env.DB.prepare("SELECT * FROM mail_document_rules WHERE active=1 AND day_from<=? AND day_to>=? AND (last_checked_kst_day IS NULL OR last_checked_kst_day<>?) ORDER BY id LIMIT 25").bind(activeDay,activeDay,today).all();
  let scannedRules=0,inserted=0,failed=0;
  for(const rule of rules.results||[]) {
    if (!inCollectionWindow(rule.day_from,rule.day_to)) continue;
    try { const result=await syncRule(env.DB,env,rule); scannedRules++; inserted+=result.inserted; }
    catch(error) {
      failed++;
      await env.DB.prepare('UPDATE mail_document_rules SET last_error=?,updated_at=? WHERE id=?')
        .bind(txt(error.code||'SYNC_FAILED',100),new Date().toISOString(),rule.id).run();
    }
  }
  return {scannedRules,inserted,failed};
}
function printable(row) {
  const e=escapeDocumentHtml;
  const labels=[['문서번호',row.document_no],['공급자',row.issuer_name],['공급받는 자',row.counterparty],['매출 기간',row.sale_period],
    ['매출액',Number(row.sale_amount||0).toLocaleString('ko-KR')+'원'],['세액(기록값)',Number(row.tax_amount||0).toLocaleString('ko-KR')+'원'],
    ['증빙 참조',row.evidence_reference],['발행일시',row.issued_at]];
  const entries=labels.map(pair=>'<tr><th>'+e(pair[0])+'</th><td>'+e(pair[1])+'</td></tr>').join('');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>매출확인서 '+e(row.document_no)+'</title><style>body{font-family:system-ui,sans-serif;max-width:740px;margin:40px auto;color:#1b2535;padding:20px}h1{text-align:center}table{border-collapse:collapse;width:100%;margin:28px 0}th,td{border:1px solid #bbb;padding:13px;text-align:left;overflow-wrap:anywhere}th{width:30%;background:#f4f6f9}.note{font-size:13px;line-height:1.6;color:#485567}@media print{body{margin:0;padding:0}}</style></head><body><h1>매출확인서</h1><p>해당 사업장의 관리자 승인에 따라 등록된 거래 증빙을 바탕으로 작성된 확인서입니다.</p><table>'+entries+'</table><p class="note">이 문서는 사업자가 기록한 매출 확인용 서류이며 국세청 전자세금계산서, 매입자 확인 또는 금융기관의 공식 증명을 대체하지 않습니다. 증빙 원본은 발급 사업장에 별도로 확인하시기 바랍니다.</p></body></html>';
}
export async function handleMailDocuments(request,env) {
  const url=new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const origin=request.headers.get('origin')||'';
  if(origin && !ORIGINS.has(origin)) return json({code:'ORIGIN_DENIED'},403);
  if(request.method==='OPTIONS') {
    const headers={'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'86400',vary:'Origin'};
    if (origin) headers['access-control-allow-origin']=origin;
    return new Response(null,{status:204,headers});
  }
  if(!env?.DB) return json({code:'DB_UNAVAILABLE'},503,origin);
  try {
    await schema(env.DB);
    const body=request.method==='POST'?await input(request):{};
    const slug=txt(request.method==='GET'?url.searchParams.get('workspace'):body.workspace,90).toLowerCase();
    if(!/^[a-z0-9][a-z0-9-]{0,89}$/.test(slug)) failure('WORKSPACE_REQUIRED');
    const {actor,site}=await workspaceFor(request,env,slug);
    if (url.pathname===PREFIX+'/overview'&&request.method==='GET') {
      const [rules,cases]=await Promise.all([
        env.DB.prepare('SELECT * FROM mail_document_rules WHERE workspace_id=? ORDER BY id DESC').bind(site.workspaceId).all(),
        env.DB.prepare('SELECT * FROM mail_document_cases WHERE workspace_id=? ORDER BY created_at DESC LIMIT 120').bind(site.workspaceId).all()
      ]);
      return json({workspace:slug,rules:rules.results,cases:cases.results,canManage:true,taxInvoiceMode:'HUMAN_APPROVAL_THEN_EKODI_FINANCE'},200,origin);
    }
    if(url.pathname===PREFIX+'/rules'&&request.method==='POST') {
      const type=txt(body.documentType,40),q=txt(body.searchQuery,180);
      if(!TYPES.has(type)||q.length<3) failure('INVALID_RULE');
      const from=day(body.dayFrom,20),to=day(body.dayTo,25);
      if(to<from) failure('INVALID_WINDOW');
      const access=await accountAccess(env.DB,actor,body.accountId);
      if (!access || !access.context || access.row.owner_key!==site.workspaceId ||
          !access.permissions.manage || !access.permissions.read) failure('ACCOUNT_PERMISSION_REQUIRED',403);
      if(access.row.provider!=='gmail') failure('MAIL_ADAPTER_NOT_AVAILABLE',409);
      const now=new Date().toISOString();
      await env.DB.prepare('INSERT INTO mail_document_rules(workspace_id,account_id,document_type,search_query,day_from,day_to,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?) ON CONFLICT(workspace_id,account_id,document_type,search_query) DO UPDATE SET day_from=excluded.day_from,day_to=excluded.day_to,active=1,updated_at=excluded.updated_at')
        .bind(site.workspaceId,access.row.id,type,q,from,to,actor.email,now,now).run();
      return json({ok:true},201,origin);
    }
    const sync=url.pathname.match(/^\/api\/mail\/control\/documents\/rules\/(\d+)\/sync$/);
    if(sync&&request.method==='POST') {
      const rule=await ruleFor(env.DB,Number(sync[1]),site);
      const access=await accountAccess(env.DB,actor,rule.account_id);
      if(!access||!access.permissions.read||!access.permissions.manage) failure('ACCOUNT_PERMISSION_REQUIRED',403);
      return json({ok:true,...await syncRule(env.DB,env,rule)},200,origin);
    }
    const disable=url.pathname.match(/^\/api\/mail\/control\/documents\/rules\/(\d+)\/disable$/);
    if(disable&&request.method==='POST') {
      const rule=await ruleFor(env.DB,Number(disable[1]),site);
      const access=await accountAccess(env.DB,actor,rule.account_id);
      if(!access||!access.permissions.manage) failure('ACCOUNT_PERMISSION_REQUIRED',403);
      await env.DB.prepare('UPDATE mail_document_rules SET active=0,updated_at=? WHERE id=? AND workspace_id=?')
        .bind(new Date().toISOString(),rule.id,site.workspaceId).run();
      return json({ok:true,active:false},200,origin);
    }
    if(url.pathname===PREFIX+'/requests'&&request.method==='POST') {
      const type=txt(body.documentType,40);
      if(!TYPES.has(type)) failure('INVALID_DOCUMENT_TYPE');
      const now=new Date().toISOString(),id=crypto.randomUUID();
      await env.DB.prepare("INSERT INTO mail_document_cases(id,workspace_id,account_id,rule_id,document_type,source_type,source_message_id,status,created_by,created_at,updated_at) VALUES(?,?,NULL,NULL,?,'manual',?,'REVIEW',?,?,?)")
        .bind(id,site.workspaceId,type,'manual:'+id,actor.email,now,now).run();
      await event(env.DB,{id,workspace_id:site.workspaceId},'document.manual.created',actor.email);
      return json({ok:true,id},201,origin);
    }
    const approve=url.pathname.match(/^\/api\/mail\/control\/documents\/requests\/([a-f0-9-]{36})\/approve$/);
    if(approve&&request.method==='POST') {
      const record=await caseFor(env.DB,approve[1],site);
      if(record.status!=='REVIEW') failure('CASE_NOT_REVIEWABLE',409);
      const value=verifyCaseEvidence(body);
      const now=new Date().toISOString();
      const updated=await env.DB.prepare("UPDATE mail_document_cases SET status='APPROVED',counterparty=?,issuer_name=?,sale_period=?,sale_amount=?,tax_amount=?,evidence_reference=?,approved_by=?,approved_at=?,updated_at=? WHERE id=? AND workspace_id=? AND status='REVIEW'")
        .bind(value.counterparty,value.issuerName,value.period,value.saleAmount,value.taxAmount,value.evidence,actor.email,now,now,record.id,site.workspaceId).run();
      if(Number(updated.meta?.changes||0)!==1) failure('CASE_STATE_CHANGED',409);
      await event(env.DB,record,'document.approved',actor.email,'human evidence review');
      return json({ok:true,status:'APPROVED',nextAction:record.document_type==='tax_invoice'?'OPEN_EKODI_FINANCE_TAX_INVOICE':'ISSUE_SALES_CERTIFICATE'},200,origin);
    }
    const issue=url.pathname.match(/^\/api\/mail\/control\/documents\/requests\/([a-f0-9-]{36})\/issue$/);
    if(issue&&request.method==='POST') {
      const record=await caseFor(env.DB,issue[1],site);
      if(record.document_type!=='sales_certificate') failure('TAX_INVOICE_EXTERNAL_ISSUANCE_REQUIRED',409);
      if(record.status!=='APPROVED'||!record.approved_at||!record.evidence_reference) failure('HUMAN_APPROVAL_REQUIRED',409);
      const now=new Date().toISOString();
      const no='EKODI-SALES-'+siteDay().replaceAll('-','')+'-'+record.id.slice(0,8).toUpperCase();
      const updated=await env.DB.prepare("UPDATE mail_document_cases SET status='ISSUED',document_no=?,issued_by=?,issued_at=?,updated_at=? WHERE id=? AND workspace_id=? AND status='APPROVED'")
        .bind(no,actor.email,now,now,record.id,site.workspaceId).run();
      if(Number(updated.meta?.changes||0)!==1) failure('CASE_STATE_CHANGED',409);
      await event(env.DB,record,'sales.certificate.issued',actor.email,no);
      return json({ok:true,documentNo:no,status:'ISSUED'},200,origin);
    }
    const print=url.pathname.match(/^\/api\/mail\/control\/documents\/requests\/([a-f0-9-]{36})\/print$/);
    if(print&&request.method==='GET') {
      const record=await caseFor(env.DB,print[1],site);
      if(record.document_type!=='sales_certificate'||record.status!=='ISSUED') failure('DOCUMENT_NOT_ISSUED',409);
      const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
      if(origin) headers['access-control-allow-origin']=origin;
      return new Response(printable(record),{headers});
    }
    return json({code:'DOCUMENT_ROUTE_NOT_FOUND'},404,origin);
  } catch(error) {
    console.error('EKODI mail documents',error?.code||'UNEXPECTED_ERROR');
    return json({error:'문서 작업을 완료하지 못했습니다.',code:error.code||'DOCUMENT_WORKFLOW_ERROR'},error.status||500,origin);
  }
}
