import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all authenticated Admin surfaces inherit the EKODI readability base', async () => {
  const css = await read('admin-readability-base.css');
  assert.match(css, /body\.compact-control-center\{/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /\.content \[data-panel\] th\{font-size:13px!important/);
  assert.match(css, /\.content \[data-panel\] td\{font-size:14px!important/);
  assert.match(css, /\.content \[data-panel\] input[^}]*font-size:15px!important/);
  assert.match(css, /#userAiMembershipPanel \.uam-head h2\{font-size:30px!important/);
  assert.match(css, /#userAiMembershipPanel \.uam-head p\{font-size:15px!important/);
  assert.match(css, /#userAiMembershipPanel \.uam-note\{font-size:13px!important/);
  assert.match(css, /:focus-visible/);
});

test('AI Ops is a flat readable command workspace', async () => {
  const css = await read('admin-readable-command.css');
  assert.match(css, /governance-command-bar\{display:none!important\}/);
  assert.match(css, /#aiOpsPanel \.ai-ops-side[^}]*display:none!important/);
  assert.match(css, /#aiOpsPanel \.ai-selected-detail[^}]*display:none!important/);
  assert.match(css, /#aiOpsPanel \.ai-chief-chat\{[^}]*position:static!important/);
  assert.match(css, /#aiOpsPanel \.ai-chat-form\{order:2/);
  assert.match(css, /#aiOpsPanel \.ai-chat-messages\{order:5/);
  assert.match(css, /#aiOpsPanel \.ai-chat-text\{font-size:15px!important/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*font-size:16px!important/);
});

test('Chief AI owns action requests and routes specialists internally', async () => {
  const js = await read('admin-readable-command.js');
  new Function(js);
  for (const phrase of ['재구성', '단순화', '배치', '조치']) assert.match(js, new RegExp(phrase));
  assert.match(js, /\/api\/control\/ai\/actions/);
  assert.match(js, /actionType:'service\.health_check'/);
  assert.match(js, /actionType:'ui\.change_request'/);
  assert.match(js, /agentId:'chief'/);
  assert.match(js, /specialistsFor/);
  assert.match(js, /전문 기능 선택을 관리자에게 넘기지 않습니다/);
  assert.match(js, /ROLE_HANDOFF_RE/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /form\.requestSubmit\(\)/);
});

test('AI Ops no longer auto-hydrates Governance cockpit or Deployments', async () => {
  const loader = await read('admin-demand-loader.js');
  const aiops = loader.match(/aiops:\s*\{([\s\S]*?)\n\s*\},\n\s*deployments:/)?.[1] || '';
  assert.match(aiops, /admin-lazy-features\.js/);
  assert.match(aiops, /system-health-admin\.js/);
  assert.doesNotMatch(aiops, /mission-control-admin/);
  assert.doesNotMatch(aiops, /release-control-admin/);
  assert.match(loader, /deployments:\s*\{/);
  assert.match(loader, /scripts: \['release-control-admin\.js'\]/);
});

test('base readability is first-path while AI orchestration stays lazy and performance guard runs last', async () => {
  const [pkg, postbuild] = await Promise.all([
    read('package.json'),
    read('scripts/admin-readable-command-postbuild.mjs'),
  ]);
  const parsed = JSON.parse(pkg);
  const build = parsed.scripts.build;
  const readableIndex = build.indexOf('admin-readable-command-postbuild.mjs');
  const performanceIndex = build.indexOf('admin-performance-postbuild.mjs');
  assert.ok(readableIndex >= 0 && performanceIndex > readableIndex);
  assert.match(postbuild, /admin-readability-base\.css/);
  assert.match(postbuild, /compact-control-center\.css/);
  assert.match(postbuild, /ai-ops-admin\.css/);
  assert.match(postbuild, /admin-lazy-features\.js/);
  assert.doesNotMatch(postbuild, /control-center\.html/);
});
