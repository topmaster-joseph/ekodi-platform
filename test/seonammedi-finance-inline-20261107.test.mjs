import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../sites/seonammedi/public/app.css', import.meta.url), 'utf8');
test('finance summary: period inline, income/expense/balance in one row (external CSS)', () => {
  assert.match(css, /dl\.committee-finance-metrics\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /div\.committee-finance-period\{grid-column:1\/-1;justify-content:flex-start/);
  assert.match(css, /dl\.committee-finance-metrics>div\{display:flex;align-items:baseline/);
  const mobile = css.slice(css.lastIndexOf('@media(max-width:540px){#committee-finance-disclosure'));
  assert.ok(!/grid-template-columns:1fr/.test(mobile), 'mobile must keep the three amounts on one row');
});

test('총수입 = 전기이월 + 기간수입 and 총수입 − 총지출 = 잔액', async () => {
  const html = await readFile(new URL('../sites/seonammedi/public/index.html', import.meta.url), 'utf8');
  const n = s => Number(s.replace(/[^0-9]/g, ''));
  const total = n(html.match(/<dt>총수입<\/dt><dd>([^<]+)<\/dd>/)[1]);
  const [, carry, period] = html.match(/전기이월 ([\d,]+)원 \+ 기간수입 ([\d,]+)원/);
  const spent = n(html.match(/<dt>총지출<\/dt><dd>([^<]+)<\/dd>/)[1]);
  const balance = n(html.match(/<dt>잔액<\/dt><dd>([^<]+)<\/dd>/)[1]);
  assert.equal(total, n(carry) + n(period));
  assert.equal(total - spent, balance);
});
