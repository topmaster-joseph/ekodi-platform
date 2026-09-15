import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTaxInvoiceNotice } from '../tax-notice-intake.js';

const root = fileURLToPath(new URL('../', import.meta.url));

const notice = `<한국전력공사 무안지사 전력구입금액 지급 안내>
☞ 국세청 홈택스에서 발행 : kepcoppa@kepco.co.kr
☞ 그 외 : ppa0155@kepco.co.kr
▧ 종사업장번호 : 155
▧ 고 객 명 : 에****광
▧ 발전소명 : 에코디태양광
▧ 대상연월 : 2026.08월분
▧ 구 입 량 : 2,613kWh
▧ 정 산 량 : 0kWh
▧ 총구입량 : 2,613kWh
▧ 기준단가 : 148.39원/kWh
▧ 당월 SMP단가 : 148.39원/kWh
▧ 공급가액 : 387,743원
▧ 부가세액 : 38,774원
▧ 총구입금액 : 426,517원
▧ 지급예정일 : 2026-09-30
▶ 총 구입금액에서 원격검침 수수료 448원(VAT포함)차감 후 지급될 예정입니다.`;
test('KEPCO notice becomes a validated draft proposal with payment reconciliation', () => {
  const parsed = parseTaxInvoiceNotice(notice);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.provider, 'KEPCO_PPA_NOTICE_V1');
  assert.equal(parsed.sender, '한국전력공사 무안지사');
  assert.equal(parsed.supplierHint, '에코디태양광');
  assert.equal(parsed.buyerTaxRegId, '155');
  assert.equal(parsed.targetPeriod, '2026-08');
  assert.equal(parsed.suggestedWriteDate, '20260831');
  assert.equal(parsed.paymentDueDate, '20260930');
  assert.equal(parsed.totalKwh, 2613);
  assert.equal(parsed.unitPrice, 148.39);
  assert.equal(parsed.supplyAmount, 387743);
  assert.equal(parsed.taxAmount, 38774);
  assert.equal(parsed.totalAmount, 426517);
  assert.equal(parsed.deductionAmount, 448);
  assert.equal(parsed.expectedReceiptAmount, 426069);
  assert.equal(parsed.emails.homeTax, 'kepcoppa@kepco.co.kr');
  assert.equal(parsed.emails.other, 'ppa0155@kepco.co.kr');
});

test('notice rejects arithmetic mismatch and unrelated input', () => {
  const bad = parseTaxInvoiceNotice(notice.replace('426,517원', '426,518원'));
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some(message => message.includes('일치하지 않습니다')));
  const unrelated = parseTaxInvoiceNotice('일반 안내 메시지');
  assert.equal(unrelated.valid, false);
  assert.equal(unrelated.provider, 'UNKNOWN');
});
test('intake service stays draft-only and requires human approval later', async () => {
  const service = await readFile(new URL('../tax-notice-intake-service.js', import.meta.url), 'utf8');
  assert.match(service, /createsDraftOnly:true/);
  assert.match(service, /humanApprovalRequired:true/);
  assert.match(service, /freeFirstWorker\.fetch/);
  assert.doesNotMatch(service, /\/issue['"`]/);
  assert.match(service, /TAX_NOTICE_DUPLICATE/);
});

test('notice intake source modules pass syntax checks', () => {
  for (const file of [
    'tax-notice-intake.js',
    'tax-notice-intake-service.js',
    'tax-service-worker.js',
    'tax-invoice-worker.js',
    'tax-portal-worker.js'
  ]) execFileSync(process.execPath, ['--check', `${root}${file}`], { stdio:'pipe' });
});
