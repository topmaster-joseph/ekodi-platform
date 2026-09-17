import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('business cooperative site is independently built under the canonical path', () => {
  const build = read('../scripts/build.mjs');
  const publicHtml = read('../sites/business-cooperative/public/index.html');
  const adminHtml = read('../sites/business-cooperative/public/admin/index.html');
  assert.ok(build.includes("sites/business-cooperative/public"));
  assert.ok(build.includes("${output}business-coop"));
  assert.ok(publicHtml.includes('data-coop-status="private-review"'));
  assert.ok(publicHtml.includes('noindex,nofollow,noarchive'));
  assert.ok(adminHtml.includes('data-coop-admin="formation-v1"'));
  assert.ok(adminHtml.includes('주민등록번호'));
});

test('cooperative admin uses the shared EKODI member gate', () => {
  const adminHtml = read('../sites/business-cooperative/public/admin/index.html');
  assert.ok(adminHtml.includes('https://ekodi.kr/shell/shell.js'));
  assert.ok(adminHtml.includes('data-ekodi-service="business"'));
  assert.ok(adminHtml.includes('data-ekodi-surface="admin"'));
  assert.ok(adminHtml.includes('data-ekodi-authority-scope="tenant"'));
  assert.ok(adminHtml.includes('data-ekodi-member-gate="shared"'));
  assert.ok(adminHtml.includes('data-ekodi-global-nav="off"'));
});

test('formation workflow carries 2026 legal timing and filing-document guardrails', () => {
  const legal = read('../sites/business-cooperative/public/legal-data.js');
  const admin = read('../sites/business-cooperative/public/admin/admin.js');
  for (const marker of [
    'minimumPromoters: 5',
    'filingProcessingDays: 20',
    'registrationAfterContributionDays: 14',
    'generalMeetingNoticeDays: 7',
    'memberThreshold: 200',
    'paidCapitalThreshold: 3000000000',
    'deadlineMonthsAfterClosing: 4',
    '창립총회 개최 공고문',
    '수입·지출 예산서',
    '발기인 및 설립동의자 명부',
  ]) assert.ok(legal.includes(marker), marker);
  assert.ok(admin.includes('state.founders.length >= COOP_LEGAL.minimumPromoters'));
  assert.ok(admin.includes('COOP_LEGAL.registrationAfterContributionDays'));
});

test('draft admin avoids collecting high-risk identity and credential fields', () => {
  const html = read('../sites/business-cooperative/public/admin/index.html');
  const js = read('../sites/business-cooperative/public/admin/admin.js');
  for (const banned of ['name="residentNumber"', 'name="bankPassword"', 'name="accountPassword"', 'name="personalAddress"']) {
    assert.equal(html.includes(banned), false, banned);
    assert.equal(js.includes(banned), false, banned);
  }
  assert.ok(html.includes('현재 설립준비 데이터는 이 브라우저에만 저장됩니다'));
});
