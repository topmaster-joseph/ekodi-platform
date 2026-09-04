import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = await readFile(new URL('../scripts/audit-admin-menu-services.mjs', import.meta.url), 'utf8');
const shell = await readFile(new URL('../admin-shell.html', import.meta.url), 'utf8');

test('admin shell exposes canonical root paths instead of retired business subdomains', () => {
  for (const url of ['https://ekodi.kr/ekodibiz','https://ekodi.kr/ekodichurch','https://ekodi.kr/ekodilab','https://ekodi.kr/ekodibiz/marketing-ai']) {
    assert.ok(shell.includes(url), `missing ${url}`);
  }
  for (const url of ['href="https://biz.ekodi.kr/','href="https://church.ekodi.kr/','href="https://lab.ekodi.kr/','href="https://marketing.ekodi.kr/']) {
    assert.ok(!shell.includes(url), `retired direct link survived: ${url}`);
  }
});

test('admin menu audit enforces the same canonical path contract', () => {
  for (const url of ['https://ekodi.kr/ekodibiz','https://ekodi.kr/ekodichurch','https://ekodi.kr/ekodilab','https://ekodi.kr/ekodibiz/marketing-ai']) assert.ok(audit.includes(url));
  for (const url of ['href="https://biz.ekodi.kr/','href="https://church.ekodi.kr/','href="https://lab.ekodi.kr/','href="https://marketing.ekodi.kr/']) assert.ok(audit.includes(url));
});
