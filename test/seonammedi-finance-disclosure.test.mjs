import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=new URL('../sites/seonammedi/public/',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
const admin=readFileSync(new URL('admin/admin.js',base),'utf8');
const adminHtml=readFileSync(new URL('admin/index.html',base),'utf8');
const control=readFileSync(new URL('../seonammedi-admin-control.js',import.meta.url),'utf8');

test('SeonamMedi public activity history exposes only the approved accounting summary and disclosure purpose',()=>{
  const section=html.match(/<section class="committee-finance-disclosure"[\\s\\S]*?<\\/section>/)?.[0];
  assert.ok(section,'public finance card must be in committee activity history');
  for(const expected of ['기간','2026.10.29.','2026.11.03.','8,900,333원','10,672,100원','14,051,738원','비상대책위원회에 문의'])assert.ok(section.includes(expected),expected);
  assert.equal((section.match(/<dt>/g)||[]).length,4);
  for(const forbidden of ['손영득','목포대여교수회','김밥','영상·음향','7,000,000원','15,823,505원'])assert.ok(!section.includes(forbidden),'private item leaked: '+forbidden);
  assert.ok(html.includes('@media(max-width:540px)'),'finance summary should adapt to narrow screens');
});

test('SeonamMedi admin-only JSON importer validates accounting and never publishes transaction details',()=>{
  assert.ok(adminHtml.includes('id="financeImportFile"'));
  assert.ok(adminHtml.includes('id="financeImportButton"'));
  assert.ok(admin.includes("state.me?.permissions?.finance"));
  assert.ok(admin.includes("visible:false"));
  assert.ok(admin.includes("'/api/seonammedi/admin/finance'"));
  assert.ok(control.includes("if(!can(auth,FINANCE_CAP))return json({ok:false,error:'finance_forbidden'},403)"));
  for(const forbidden of ['손영득','목포대여교수회','김밥','경향신문광고 후원금'])assert.ok(!admin.includes(forbidden),'private transaction hard-coded in public repository: '+forbidden);

  const start=admin.indexOf('function financeImportEntries(report){');
  const end=admin.indexOf("$('financeImportButton')?.",start);
  assert.ok(start>0&&end>start,'isolated finance parser exists');
  const parse=new Function(admin.slice(start,end)+'\\nreturn financeImportEntries;')();
  const fixture={reportId:'sample-report-01',asOfDate:'2026-11-04',previousBalance:150,totalIncome:60,totalExpense:20,closingBalance:190,
    income:[{date:null,count:2,amount:60,description:'총괄후원'}],
    expenses:[{date:'2026-11-03',amount:20,description:'교통비'}]};
  const parsed=parse(fixture);
  assert.equal(parsed.rows.length,2);
  assert.equal(parsed.rows[0].date,'2026-11-04');
  assert.match(parsed.rows[0].note,/실제 거래일 미기재/);
  assert.equal(parsed.rows[0].visible,false);
  assert.equal(parsed.rows[1].date,'2026-11-03');
  assert.throws(()=>parse({...fixture,closingBalance:191}),/일치하지 않습니다/);
  assert.throws(()=>parse({...fixture,asOfDate:'incorrect-date'}),/기준일/);
});
