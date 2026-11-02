import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const patch = readFileSync(new URL('../church-i18n-payment-patch.js', import.meta.url), 'utf8');

test('extended payment translations are wired into the church runtime', () => {
  const extended = html.indexOf('church-i18n-extended.js');
  const payment = html.indexOf('church-i18n-payment-patch.js');
  const giving = html.indexOf('giving.js');
  assert.ok(extended >= 0 && payment > extended && giving > payment);
  assert.match(patch, /add\('카드·자동이체'/);
  assert.match(patch, /new MutationObserver/);
});
