import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('OpenAI is a visible Operations Center workspace, not a core capability', async () => {
  const registry = await read('admin-menu-registry.js');
  assert.match(registry, /id: 'openai'.*group: 'operations-center'.*providerWorkspace: true/);
  assert.doesNotMatch(await read('config/capability-registry.json'), /"id"\s*:\s*"openai"/);
});

test('OpenAI workspace is fully demand-loaded and routable', async () => {
  const [layout, loader, build] = await Promise.all([read('admin-menu-layout.js'), read('admin-demand-loader.js'), read('scripts/build.mjs')]);
  assert.match(layout, /\['openai','openai'\]/); assert.match(layout, /#openai:openai/); assert.match(layout, /openai:#openai/);
  assert.match(loader, /openai-workspace-admin\.css/); assert.match(loader, /openai-workspace-admin\.js/); assert.match(loader, /hashes:\s*\['#openai'\]/);
  assert.match(build, /openai-workspace-admin\.css/); assert.match(build, /openai-workspace-admin\.js/);
});

test('Context bridge keeps EKODI authority isolated and returns through Admin AI', async () => {
  const [workspace, assist] = await Promise.all([read('openai-workspace-admin.js'), read('admin-assist-dock.js')]);
  assert.match(workspace, /https:\/\/chatgpt\.com\//); assert.match(workspace, /Permission transfer: NONE/);
  assert.match(workspace, /EKODIAdminContext/); assert.match(workspace, /ekodi-admin-assist-request/); assert.match(workspace, /admin-lazy-features\.js/);
  assert.doesNotMatch(workspace, /<iframe/i); assert.doesNotMatch(workspace, /ekodi-auth-token/); assert.doesNotMatch(workspace, /api\.openai\.com/);
  assert.match(assist, /ekodi-admin-assist-request/); assert.match(assist, /submitAi\(text\)/);
});
