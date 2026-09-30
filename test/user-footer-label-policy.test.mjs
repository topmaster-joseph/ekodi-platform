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