import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isPublicAccountingNoticePath, publicAccountingNoticePage } from '../public-accounting-notice-page.js';

const finance=fs.readFileSync('finance-banking-worker.js','utf8');
const admin=fs.readFileSync('tenant-finance-admin.js','utf8');
const header=fs.readFileSync('shell/user-ui-header.js','utf8');
const site=fs.readFileSync('site-worker.js','utf8');

test('public accounting notice is a site submenu, not a homepage block',async()=>{
  for(const key of ['ekodibiz','ekodichurch','ekodimission','cgma','seonammedi'])assert.equal(isPublicAccountingNoticePath(`/${key}/accounting`),true,key);
  assert.equal(isPublicAccountingNoticePath('/ekodibiz'),false);
  const response=publicAccountingNoticePage('/ekodibiz/accounting');
  const html=await response.text();
  assert.equal(response.status,200);
  for(const marker of ['회계공지','연도 선택','연간 총괄','월별 소계','public-accounting-notice.js'])assert.match(html,new RegExp(marker));
  assert.doesNotMatch(html,/계좌번호|거래처명|거래 상세/);
});

test('public API exposes annual minimum aggregates without authentication or transaction detail',()=>{
  assert.match(finance,/PUBLIC_ACCOUNTING_WORKSPACES/);
  assert.match(finance,/publicAccountingSummary/);
  assert.match(finance,/\/api\/finance\/banking\/public-summary/);
  assert.match(finance,/detailDisclosure:false/);
  assert.match(finance,/SUM\(CASE WHEN direction='in'/);
  const publicRoute=finance.indexOf("url.pathname==='/api/finance/banking/public-summary'");
  const actorGate=finance.indexOf('const actor=await resolveActor');
  assert.ok(publicRoute>0&&publicRoute<actorGate,'public aggregate route must precede private actor gate');
  assert.doesNotMatch(finance.slice(finance.indexOf('async function publicAccountingSummary'),finance.indexOf('async function resolveActor')),/description|counterparty|account_last4/);
});

test('site shell and administrator expose accounting notice through governed navigation',()=>{
  assert.match(site,/isPublicAccountingNoticePath/);
  assert.match(site,/public-accounting-notice\.css/);
  assert.match(header,/ensureAccountingNoticeMenu/);
  assert.match(header,/회계공지/);
  assert.match(admin,/PUBLIC_ACCOUNTING_SCOPES/);
  for(const marker of ['조직별 전용 양식','profile.basis','사용자 회계공지 보기'])assert.match(admin,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
