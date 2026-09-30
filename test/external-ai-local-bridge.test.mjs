import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('external AI bridge is explicit one-shot prefill with no auto-send',async()=>{
  const [manifestRaw,policyRaw,background,admin,provider,dock]=await Promise.all([
    read('browser/ekodi-external-ai-bridge/manifest.json'),
    read('config/external-ai-local-bridge-policy.json'),
    read('browser/ekodi-external-ai-bridge/background.js'),
    read('browser/ekodi-external-ai-bridge/admin-bridge.js'),
    read('browser/ekodi-external-ai-bridge/provider-bridge.js'),
    read('admin-assist-dock.js'),
  ]);
  const manifest=JSON.parse(manifestRaw),policy=JSON.parse(policyRaw);
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,['tabs','storage']);
  assert.equal(policy.userAgency.autoSubmit,false);
  assert.equal(policy.userAgency.responseCapture,false);
  assert.equal(policy.dataBoundary.promptInUrl,false);
  assert.equal(policy.dataBoundary.clipboardRead,false);
  assert.match(background,/chrome\.storage\.session/);
  assert.match(background,/url:'about:blank'/);
  assert.match(admin,/ekodi-external-ai-handoff/);
  assert.match(provider,/fillPrompt/);
  assert.doesNotMatch(provider,/\.click\(\)/);
  assert.match(dock,/ekodi-external-ai-bridge-ready/);
  assert.match(dock,/open-provider-and-copy|copyText/);
});
