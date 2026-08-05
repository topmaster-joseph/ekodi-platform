import assert from 'node:assert/strict';
import test from 'node:test';
import { ERP_MODULES, validateLedgerEntry } from '../src/index.ts';

test('ERP modules are explicit', () => {
  assert.deepEqual(ERP_MODULES, ['finance', 'sales', 'purchasing', 'inventory', 'people']);
});

test('ledger entries normalize valid won-denominated input', () => {
  assert.deepEqual(validateLedgerEntry({ account: ' 매출 ', description: ' 서비스 ', amount: 150000, occurredOn: '2026-08-05' }), {
    value: { account: '매출', description: '서비스', amount: 150000, occurredOn: '2026-08-05' }
  });
  assert.match(validateLedgerEntry({ account: '매출', amount: 1.5, occurredOn: '2026-08-05' }).error, /정수/);
});
