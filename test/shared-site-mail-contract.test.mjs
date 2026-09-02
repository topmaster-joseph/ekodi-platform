import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared runtime link audit includes the current EKODI Mail user surface', async () => {
  const workflow = await read('.github/workflows/deploy-site-core.yml');
  const mailPage = await read('mail-user-page.js');
  for (const marker of ['<title>EKODI Mail</title>', 'id="accountLabel"', 'id="searchForm"', 'id="gmailLink"']) {
    assert.ok(mailPage.includes(marker), `mail user page must expose ${marker}`);
  }
  assert.match(workflow, /https:\/\/mail\.ekodi\.kr\//);
  assert.match(workflow, /EKODI production link audit/);
  assert.match(workflow, /grep -io '<title>\[\^<\]\*<\/title>'/);
  assert.doesNotMatch(workflow, /grep -Fq 'EKODI Hub' \/tmp\/mail-body/);
});
