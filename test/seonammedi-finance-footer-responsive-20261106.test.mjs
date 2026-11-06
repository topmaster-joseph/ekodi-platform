import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../sites/seonammedi/public/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const css=readFileSync(new URL('app.css',root),'utf8');
const disclosure=html.match(/<section class="committee-finance-disclosure"[\s\S]*?<\/section>/)?.[0]||'';
const footer=html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0]||'';
const marker=css.indexOf('SEONAMMEDI-FINANCE-RESPONSIVE-20261106');
const desktop=css.slice(marker,css.indexOf('@media (max-width:959px)',marker));
const mobile=css.slice(css.indexOf('@media (max-width:959px)',marker),css.indexOf('@media (max-width:400px)',marker));
const footerStyle=css.slice(css.indexOf('SEONAMMEDI-FOOTER-RESPONSIVE-20261106'));

test('finance summary retains four approved fields, aggregate amounts, and administrator-only editor',()=>{
  assert.ok(disclosure,'public finance summary must exist');
  for(const [label,id,value] of [
    ['기간','committeeFinancePeriod','2026.10.29. ~ 2026.11.03.'],
    ['총수입','committeeFinanceIncome','8,900,333원'],
    ['총지출','committeeFinanceExpense','10,672,100원'],
    ['잔액','committeeFinanceBalance','14,051,738원']
  ]) {
    assert.match(disclosure,new RegExp('<dt>'+label+'</dt>\\s*<dd id="'+id+'">'+value.replace(/\./g,'\\.')+'</dd>'));
  }
  assert.doesNotMatch(disclosure,/기재된 지출일 기준/);
  assert.match(disclosure,/id="committeeFinanceEditToggle"[^>]*hidden/);
  assert.match(disclosure,/id="committeeFinanceEditForm"[^>]*hidden/);
  assert.equal((disclosure.match(/<dt>/g)||[]).length,4);
});

test('desktop renders three totals in one row with period spanning entire grid',()=>{
  assert.ok(marker>0,'responsive finance override must exist');
  assert.match(desktop,/@media \(min-width:960px\)/);
  assert.match(desktop,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(desktop,/\.committee-finance-period\s*\{\s*grid-column:1\/-1/);
  for(const field of ['income','expense','balance']) {
    assert.ok(desktop.includes('.committee-finance-'+field),'desktop includes '+field);
  }
  assert.match(desktop,/grid-column:auto/);
  assert.match(desktop,/flex-wrap:nowrap/);
  assert.match(desktop,/font-variant-numeric:tabular-nums/);
});

test('mobile stacks totals in separate full-width rows including narrow period readability',()=>{
  assert.match(mobile,/@media \(max-width:959px\)/);
  assert.match(mobile,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobile,/grid-column:1\/-1/);
  assert.match(mobile,/white-space:normal/);
  assert.match(footerStyle,/@media \(max-width:400px\)/);
});

test('footer remains contactable and responsive',()=>{
  assert.ok(footer);
  assert.match(footer,/<strong>서남권국립의대<\/strong>/);
  assert.match(footer,/<a href="tel:01035018542">/);
  assert.match(footer,/<a href="mailto:ekodibiz@gmail.com">/);
  assert.match(footer,/<a href="admin\/">관리<\/a>/);
  assert.match(footerStyle,/footer\.site-footer\s*\{/);
  assert.match(footerStyle,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(footerStyle,/footer\.site-footer \.site-footer-copy\s*\{/);
  assert.match(footerStyle,/overflow-wrap:anywhere/);
  assert.match(footerStyle,/@media \(max-width:760px\)/);
  assert.match(footerStyle,/@media \(max-width:400px\)/);
  assert.match(footerStyle,/grid-template-columns:minmax\(0,1fr\)\}/);
});

test('cache-busted stylesheet and JS share one release version',()=>{
  assert.match(html,/\/seonammedi\/app\.css\?v=20261106-finance-footer-responsive-1/);
  assert.match(html,/\/seonammedi\/app\.js\?v=20261106-finance-footer-responsive-1/);
  assert.doesNotMatch(html,/<style id="committee-finance-disclosure-style">/);
});
