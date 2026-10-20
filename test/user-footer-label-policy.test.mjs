import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderEkodiUserFooter } from '../config/user-footer.js';

test('shared user footer keeps business facts but drops heading labels', async () => {
  const html=renderEkodiUserFooter();
  assert.match(html,/에코디비즈/);
  assert.match(html,/백련동1길 17-4/);
  assert.doesNotMatch(html,/운영주체|사업장 소재지/);
  const client=await readFile(new URL('../shell/user-ui-footer.js',import.meta.url),'utf8');
  assert.doesNotMatch(client,/operator\.label|contact\.addressLabel/);
});

test('service-owned EKODIBIZ footer follows the same label-free rule in every locale', async () => {
  const [html,client]=await Promise.all([readFile(new URL('../ekodibiz/index.html',import.meta.url),'utf8'),readFile(new URL('../ekodibiz/site.js',import.meta.url),'utf8')]);
  assert.doesNotMatch(html,/운영주체|사업장 소재지/);
  assert.doesNotMatch(client,/운영주체 에코디비즈|Operator EKODIBIZ|运营主体 EKODIBIZ|運営主体 EKODIBIZ|सञ्चालक EKODIBIZ|Đơn vị vận hành EKODIBIZ/);
  assert.match(client,/footerCompany:'EKODIBIZ · Representative/);
});
test('shared footer shows the 통신판매업 신고번호 next to the business registration number', async () => {
  const { renderEkodiUserFooter, EKODI_USER_FOOTER } = await import('../config/user-footer.js');
  const html = renderEkodiUserFooter();
  assert.equal(EKODI_USER_FOOTER.operator.commerceRegistrationNumber, '2023-전남무안-0153');
  assert.ok(html.includes('<span>통신판매업신고번호 2023-전남무안-0153</span>'));
  assert.ok(html.indexOf('사업자등록번호 213-13-01959') < html.indexOf('통신판매업신고번호'));
});
