import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../hub.html', import.meta.url), 'utf8');
const payBlock = html.match(/if \(host === 'pay\.ekodi\.kr'[\s\S]*?\} else if \(host\.startsWith\('mail\.'\)\)/)?.[0] || '';

test('public EKODI Pay root is a minimal payment doorway', () => {
  assert.match(payBlock, /minimal:true, noindex:true/);
  assert.match(payBlock, /안전한 결제 서비스를 제공합니다/);
  assert.match(payBlock, /결제는 연결된 EKODI 서비스에서 시작해 주세요/);
  assert.match(payBlock, /EKODI로 돌아가기/);
  assert.doesNotMatch(payBlock, /에코디비즈 결제|결제 · 회계 관제|Toss|common\.admin/);
});

test('minimal pay doorway does not expose its host context or force a new tab', () => {
  assert.match(payBlock, /context:''/);
  assert.match(payBlock, /'https:\/\/ekodi\.kr','primary',true/);
  assert.match(html, /meta\.content='noindex,nofollow,noarchive'/);
  assert.match(html, /x\.sameTab \? '' : ' target="_blank" rel="noopener"'/);
});
