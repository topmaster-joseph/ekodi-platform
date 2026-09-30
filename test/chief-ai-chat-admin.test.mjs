import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Chief AI chat stays guarded, contextual and grounded in Control API', async () => {
  const source = await read('admin-lazy-features.js');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /CHIEF AI CONVERSATION/);
  assert.match(source, /ekodi-chief-ai-chat-v1/);
  assert.match(source, /\/api\/control\/overview/);
  assert.match(source, /\/api\/control\/check/);
  assert.match(source, /DECISION_RULES/);
  assert.match(source, /SECRET_RE/);
  assert.match(source, /Decision Gate/);
  assert.match(source, /Marketing AI/);
  assert.match(source, /sessionStorage\.setItem\(CHAT_STATE_KEY/);
  assert.doesNotMatch(source, /localStorage\.setItem\(CHAT_STATE_KEY/);
  assert.match(source, /staging → CI → guarded release/);
});

test('Chief AI chat loads only after AI Ops opens without hydrating unrelated cockpits', async () => {
  const [pkg, build, shell, demand, patch] = await Promise.all([
    read('package.json'),
    read('scripts/build.mjs'),
    read('admin-authenticated-shell.js'),
    read('admin-demand-loader.js'),
    read('admin-readable-command.js'),
  ]);
  assert.match(pkg, /node --check admin-lazy-features\.js/);
  assert.match(build, /'admin-lazy-features\.js'/);
  assert.match(build, /minimal pre-auth Admin Shell/);
  assert.doesNotMatch(shell, /'admin-lazy-features\.js'/);
  assert.match(demand, /secondaryScripts: \['admin-lazy-features\.js'\]/);
  const aiOpsStart = demand.indexOf('aiops: {');
  const aiOpsEnd = demand.indexOf("devotional:", aiOpsStart);
  const aiOpsBlock = aiOpsStart >= 0 && aiOpsEnd > aiOpsStart ? demand.slice(aiOpsStart, aiOpsEnd) : '';
  assert.ok(aiOpsBlock, 'AI Ops feature block must be extractable');
  assert.match(aiOpsBlock, /scripts: \['ai-ops-admin\.js'\]/);
  assert.match(aiOpsBlock, /secondaryScripts: \['admin-lazy-features\.js'\]/);
  assert.doesNotMatch(aiOpsBlock, /system-health-admin|mission-control-admin|release-control-admin/);
  assert.match(demand, /health:\s*\{/);
  assert.match(demand, /scripts: \['system-health-admin\.js'\]/);
  assert.match(demand, /deployments:\s*\{/);
  assert.ok(demand.includes("scripts:['release-control-admin.js']"));
  assert.match(patch, /ROLE_HANDOFF_RE/);
  assert.match(patch, /actionType:'ui\.change_request'/);
  assert.match(shell, /return Boolean\(token\(\) && app && !app\.hidden\)/);
});
