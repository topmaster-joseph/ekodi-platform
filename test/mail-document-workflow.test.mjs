import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inCollectionWindow,shouldProcessDocumentRule,escapeDocumentHtml,verifyCaseEvidence,fetchDocumentMailPage} from '../mail-document-workflow.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('EKODI solar 20-25 KST mailbox window is exact',()=>{
  assert.equal(inCollectionWindow(20,25,new Date('2026-11-19T10:00:00Z')),false);
  assert.equal(inCollectionWindow(20,25,new Date('2026-11-19T15:15:00Z')),true);
  assert.equal(inCollectionWindow(20,25,new Date('2026-11-25T14:30:00Z')),true);
  assert.equal(inCollectionWindow(20,25,new Date('2026-11-25T15:01:00Z')),false);
});
test('unverified financial document cannot be approved and KRW amounts are exact',()=>{
  assert.throws(()=>verifyCaseEvidence({counterparty:'한국전력',saleAmount:10000,taxAmount:1000}),/SALE_EVIDENCE_REQUIRED/);
  assert.throws(()=>verifyCaseEvidence({counterparty:'한국전력',issuerName:'사업자',salePeriod:'2026-10',evidenceReference:'invoice-123',saleAmount:10.5,taxAmount:1}),/INVALID_AMOUNT/);
  const valid=verifyCaseEvidence({counterparty:'한국전력',issuerName:'태양광 발전사업자',salePeriod:'2026-10',evidenceReference:'원본 거래명세 2026-10-01',saleAmount:100000,taxAmount:10000});
  assert.equal(valid.saleAmount,100000);assert.equal(valid.taxAmount,10000);
});
test('certificate must escape untrusted mail text',()=>{
  assert.equal(escapeDocumentHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeDocumentHtml("O'Reilly & friends"),"O&#39;Reilly &amp; friends");
});
test('document workflow gates per-tenant access and legal issue authority',async()=>{
  const src=await read('mail-document-workflow.js');
  for(const fragment of ['WORKSPACE_FINANCE_FORBIDDEN','ACCOUNT_PERMISSION_REQUIRED','workspace_id=?','HUMAN_APPROVAL_REQUIRED','mail.request.detected','MAIL_READ_SCOPE_REQUIRED','TAX_INVOICE_EXTERNAL_ISSUANCE_REQUIRED']) assert.ok(src.includes(fragment),fragment);
  assert.ok(!src.includes('TAX_INVOICE_LIVE_ENABLED = true'));
});
test('cron/UI/schema declare bounded, consented inbox-to-document workflow',async()=>{
  const [api,ui,migration,mail]=await Promise.all(['api-worker.js','mail-admin-page.js','migrations/202611121100_site_mail_documents.sql','mail-control.js'].map(read));
  assert.match(api,/runMailDocumentsSchedule\(env\)/);assert.match(api,/handleMailDocuments\(request, env\)/);
  assert.match(ui,/tab-docs/);assert.match(ui,/매출확인서 발행/);assert.match(ui,/ekodisolar@gmail\.com/);
  assert.match(ui,/전자세금계산서 발행 관리/);assert.match(ui,/Gmail 읽기·발송 연결/);
  assert.match(migration,/UNIQUE\(workspace_id,account_id,source_message_id,document_type\)/);
  assert.match(mail,/export async function mailActor/);assert.match(mail,/export async function accountAccess/);
});

test('bounded single-page scan continues archived Gmail messages with durable page tokens',async()=>{
  const calls=[];
  const readPage=async args=>{
    calls.push(args);
    return args.pageToken
      ? {messages:[{id:'message-13'}],nextPageToken:null}
      : {messages:Array.from({length:12},(_,i)=>({id:'message-'+i})),nextPageToken:'next-page'};
  };
  const first=await fetchDocumentMailPage(readPage,'"한국전력" "세금계산서"');
  assert.equal(first.messages.length,12);
  assert.equal(first.hasMore,true);
  assert.equal(first.nextPageToken,'next-page');
  const second=await fetchDocumentMailPage(readPage,'"한국전력" "세금계산서"',first.nextPageToken);
  assert.equal(second.hasMore,false);
  assert.equal(second.messages.length,1);
  assert.equal(calls.length,2);
  for(const call of calls){ assert.equal(call.maxResults,12);assert.equal(call.inboxOnly,false); }
  assert.equal(calls[1].pageToken,'next-page');
});
test('cursor loops and malformed Gmail API payload fail closed',async()=>{
  await assert.rejects(fetchDocumentMailPage(async()=>({messages:[],nextPageToken:'repeat'}),'mail','repeat'),/MAIL_PAGE_CURSOR_LOOP/);
  await assert.rejects(fetchDocumentMailPage(async()=>({nextPageToken:''}),'mail'),/MAIL_RESPONSE_INVALID/);
});
test('cron only processes one site rule per tick, resuming by oldest attempt',async()=>{
  const [source,migration,ui]=await Promise.all(['mail-document-workflow.js','migrations/202611130930_mail_document_scan_cursors.sql','mail-admin-page.js'].map(read));
  assert.match(source,/ORDER BY COALESCE\(r\.last_checked_at,r\.created_at\) ASC,r\.id LIMIT 1/);
  assert.match(source,/maxResults: 12/);
  assert.match(source,/mail_document_scan_cursors/);
  assert.match(source,/last_checked_kst_day=\?/);
  assert.match(source,/MAIL_PAGE_CURSOR_LOOP/);
  assert.match(source,/cursorReset:true/);
  assert.match(source,/if \(!rule.active\) failure\('RULE_DISABLED',409\)/);
  assert.match(migration,/PRIMARY KEY\(workspace_id,rule_id\)/);
  assert.match(ui,/다음 페이지가 남아 있습니다/);
  assert.match(ui,/처음부터 다시 점검/);
});
test('read-only login boundary, disabled-rule guard, and manual tax request exist',async()=>{
  const [workflow,ui,adapter]=await Promise.all(['mail-document-workflow.js','mail-admin-page.js','mail-google-adapter.js'].map(read));
  assert.ok(workflow.indexOf('await workspaceFor(request,env,slug)')<workflow.indexOf('await schema(env.DB);',workflow.indexOf('export async function handleMailDocuments')));
  assert.match(workflow,/RULE_DISABLED/);
  assert.match(ui,/docManualTax/);
  assert.match(ui,/createDocumentRequest\('tax_invoice'\)/);
  assert.match(adapter,/inboxOnly = true/);
});

test('continue a KST 25th mailbox backlog after the window closes, without starting a new scan',()=>{
  const normal={active:1,day_from:20,day_to:25,cursor_pending:0};
  const unfinished={...normal,cursor_pending:1};
  assert.equal(shouldProcessDocumentRule(normal,new Date('2026-11-25T14:59:00Z')),true);
  assert.equal(shouldProcessDocumentRule(normal,new Date('2026-11-25T15:01:00Z')),false);
  assert.equal(shouldProcessDocumentRule(unfinished,new Date('2026-11-25T15:01:00Z')),true);
  assert.equal(shouldProcessDocumentRule(unfinished,new Date('2026-12-01T12:00:00Z')),true);
  assert.equal(shouldProcessDocumentRule({...unfinished,active:0},new Date('2026-11-25T16:00:00Z')),false);
  assert.equal(shouldProcessDocumentRule({...unfinished,cursor_pending:0},new Date('2026-11-25T16:00:00Z')),false);
});
test('scheduled SQL uses workspace AND rule ID for pending cursor, including outside intake window',async()=>{
  const source=await read('mail-document-workflow.js');
  assert.match(source,/LEFT JOIN mail_document_scan_cursors c/);
  assert.match(source,/c\.workspace_id=r\.workspace_id AND c\.rule_id=r\.id/);
  assert.match(source,/r\.active=1 AND \(c\.rule_id IS NOT NULL OR/);
  assert.match(source,/if \(!shouldProcessDocumentRule\(rule\)\) continue/);
  assert.match(source,/r\.last_checked_kst_day IS NULL OR r\.last_checked_kst_day<>\?/);
  assert.match(source,/r\.day_from<=\? AND r\.day_to>=\?/);
});

test('original Gmail evidence view stays on-demand, tenant-authorized and HTML-safe',async()=>{
  const [ui,api]=await Promise.all(['mail-admin-page.js','mail-control.js'].map(read));
  assert.match(ui,/r\.source_type==='mail'/);
  assert.match(ui,/docShowOriginal\(d,r\)/);
  assert.match(ui,/api\('\/accounts\/'\+Number\(record\.account_id\)\+'\/messages\/'/);
  assert.match(ui,/body\.textContent=String\(mail\.body\|\|mail\.snippet/);
  assert.match(ui,/view\.replaceChildren/);
  assert.doesNotMatch(ui,/body\.innerHTML\s*=/);
  assert.match(api,/if\(!access\.permissions\.read\)return json\(\{error:'이 계정의 메일을 읽을 권한이 없습니다.'/);
  assert.match(api,/await getGoogleMailMessage\(auth\.accessToken,messageMatch\[2\]\)/);
});
