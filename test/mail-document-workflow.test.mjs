import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inCollectionWindow,escapeDocumentHtml,verifyCaseEvidence,collectDocumentMailPages} from '../mail-document-workflow.js';
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

test('document scan follows Gmail pagination including archived matches',async()=>{
  const calls=[];
  const messages=await collectDocumentMailPages(async opts=>{
    calls.push(opts);
    return calls.length===1
      ? {messages:Array.from({length:50},(_,i)=>({id:'message-'+i})),nextPageToken:'page2'}
      : {messages:[{id:'message-50'}],nextPageToken:null};
  },'"한국전력" "세금계산서"');
  assert.equal(calls.length,2);
  assert.equal(calls[0].inboxOnly,false);
  assert.equal(calls[1].pageToken,'page2');
  assert.equal(messages.length,51);
});
test('a large/looping mailbox cannot be silently marked as a completed scan',async()=>{
  await assert.rejects(
    collectDocumentMailPages(async ({pageToken})=>({messages:[{id:'example'}],nextPageToken:'next-'+pageToken}), 'mail', {maxPages:3}),
    /MAIL_SCAN_LIMIT_REACHED/
  );
  await assert.rejects(
    collectDocumentMailPages(async()=>({messages:[],nextPageToken:'same'}), 'mail'),
    /MAIL_PAGE_CURSOR_LOOP/
  );
});
test('read-only login boundary, disabled-rule guard, and manual tax request exist',async()=>{
  const [workflow,ui,adapter]=await Promise.all(['mail-document-workflow.js','mail-admin-page.js','mail-google-adapter.js'].map(read));
  assert.ok(workflow.indexOf('await workspaceFor(request,env,slug)')<workflow.indexOf('await schema(env.DB);',workflow.indexOf('export async function handleMailDocuments')));
  assert.match(workflow,/RULE_DISABLED/);
  assert.match(ui,/docManualTax/);
  assert.match(ui,/createDocumentRequest\('tax_invoice'\)/);
  assert.match(adapter,/inboxOnly = true/);
});
