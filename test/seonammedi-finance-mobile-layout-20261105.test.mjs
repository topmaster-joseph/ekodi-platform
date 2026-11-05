import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../sites/seonammedi/public/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const css=await readFile(new URL('app.css',root),'utf8');
const section=html.match(/<section class="committee-finance-disclosure"[\s\S]*?<\/section>/)?.[0];

test('public financial disclosure has the approved title and only four aggregate fields',()=>{
  assert.ok(section,'public disclosure must exist');
  assert.match(section,/<h3 id="committeeFinanceDisclosureTitle">회계내역 공개<\/h3>/);
  assert.doesNotMatch(section,/비상대책위원회 회계 요약/);
  for(const value of ['기간','2026.10.29.','2026.11.03.','총수입','8,900,333원','총지출','10,672,100원','잔액','14,051,738원','2026.11.04.']){
    assert.ok(section.includes(value),value);
  }
  assert.equal((section.match(/<dt>/g)||[]).length,4);
  assert.match(section,/개별 수입·지출 내역과 증빙은 개인정보 보호를 위해 공개하지 않습니다/);
  assert.match(section,/비상대책위원회에 문의/);
  assert.doesNotMatch(section,/(?:거래번호|계좌번호|주민등록번호|수령인)/);
});

test('finance layout uses an external CSS file accepted by strict style-src self CSP',()=>{
  assert.match(html,/href="\/seonammedi\/app\.css\?v=20261105-finance-inline-2"/);
  assert.doesNotMatch(html,/<style id="committee-finance-disclosure-style">/);
  assert.match(css,/#committee-finance-disclosure \.committee-finance-metrics\s*\{\s*display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:580px\)\s*\{/);
  assert.match(css,/Finance summary: label and value share one line/);
  assert.match(css,/\.committee-finance-balance\s*\{\s*grid-column:1\/-1/);
  assert.match(css,/\.committee-finance-period\s*\{\s*grid-column:1\/-1/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});

test('period and all totals display beside their labels, without date qualification',()=>{
  assert.doesNotMatch(section,/기재된 지출일 기준/);
  for(const [label,id] of [['총수입','committeeFinanceIncome'],['총지출','committeeFinanceExpense'],['잔액','committeeFinanceBalance']]){
    assert.match(section,new RegExp('<dt>'+label+'</dt><dd id="'+id+'">'));
  }
  assert.match(section,/<dt>기간<\/dt>\s*<dd id="committeeFinancePeriod">2026.10.29. ~ 2026.11.03.<\/dd>/);
  assert.match(css,/Finance summary: label and value share one line/);
  assert.match(css,/Finance summary: label and value share one line/);
});

test('public editing controls stay hidden until server-confirmed finance capability',()=>{
  assert.match(section,/id="committeeFinanceEditToggle"[^>]*hidden/);
  assert.match(section,/id="committeeFinanceEditForm"[^>]*hidden/);
  assert.match(section,/name="startDate" type="date" required/);
  assert.match(section,/name="endDate" type="date" required/);
  for(const name of ['income','expense','balance'])assert.match(section,new RegExp('name="'+name+'" type="number"'));
});
