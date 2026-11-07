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
