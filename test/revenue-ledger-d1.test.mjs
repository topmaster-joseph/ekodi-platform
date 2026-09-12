import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRevenueLedger } from '../revenue-ledger-d1.js';

test('realized revenue ledger fails closed without an explicit D1 database', async () => {
  await assert.rejects(() => ensureRevenueLedger(null), /D1 database is required/);
});
