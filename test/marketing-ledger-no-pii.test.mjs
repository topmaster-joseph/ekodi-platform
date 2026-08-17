import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/0023_marketing_event_ledger.sql', import.meta.url), 'utf8').toLowerCase();

test('central Marketing ledger has no raw customer contact columns', () => {
  for (const forbidden of ['customer_name','customer_email','customer_phone','phone_number','email_address','postal_address']) {
    assert.equal(sql.includes(forbidden), false, `${forbidden} must not be stored in the central Marketing ledger`);
  }
  assert.ok(sql.includes('customer_key'));
  assert.ok(sql.includes('identity_salt'));
});
