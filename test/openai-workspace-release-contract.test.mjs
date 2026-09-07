import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));

test('OpenAI workspace assets enter the guarded Shared Site release graph', () => {
  for (const asset of ['openai-workspace-admin.js','openai-workspace-admin.css']) {
    assert.match(workflow, new RegExp(`- '${asset.replaceAll('.', '\\.')}'`));
    assert.ok(workflow.includes(`dist/${asset}`));
  }
  for (const marker of ['Permission transfer: NONE','EKODIAdminContext','ekodi-admin-assist-request']) assert.ok(workflow.includes(marker));
});

test('OpenAI workspace production assets have explicit smoke contracts', () => {
  const byUrl = new Map(manifest.worker.requests.map(request => [request.url, request]));
  const js = byUrl.get('https://admin.ekodi.kr/openai-workspace-admin.js');
  const css = byUrl.get('https://admin.ekodi.kr/openai-workspace-admin.css');
  assert.ok(js && css);
  for (const marker of ['Permission transfer: NONE','EKODIAdminContext','ekodi-admin-assist-request']) assert.ok(js.expect.includes(marker));
  for (const marker of ['.openai-workspace-policy','@media(max-width:900px)']) assert.ok(css.expect.includes(marker));
  assert.equal(js.rollbackVerify, false); assert.equal(css.rollbackVerify, false);
});
