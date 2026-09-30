import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared runtime mail verifier follows the current EKODI Mail user app contract', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const mailPage = await read('mail-user-page.js');
  const markers = [
    '<title>EKODI Mail</title>',
    'id="accountLabel"',
    'id="searchForm"',
    'id="providerLink"',
  ];

  for (const marker of markers) {
    assert.ok(mailPage.includes(marker), `mail user page must expose ${marker}`);
    assert.ok(workflow.includes(`grep -Fq '${marker}' /tmp/mail-body`), `shared-site verifier must check ${marker}`);
  }

  assert.ok(!workflow.includes("grep -Fq 'EKODI Hub' /tmp/mail-body"));
});