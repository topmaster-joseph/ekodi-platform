import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI membership operations is a separate lazy admin menu', async () => {
  const loader = await readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../user-ai-tier-panel.js', import.meta.url), 'utf8');
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const deploy = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

  assert.match(loader, /aimembers:\s*\{/);
  assert.match(loader, /label: 'AI 회원운영'/);
  assert.match(loader, /real: '\[data-section="ai-membership"\]'/);
  assert.match(loader, /hashes: \['#ai-membership'\]/);
  assert.match(loader, /scripts: \['ai-ops-admin\.js'\]/);

  assert.match(panel, /button\.dataset\.section = SECTION/);
  assert.doesNotMatch(panel, /data-demand-feature=\"aimembers\"[^\n]*\.remove\(\)/);
  assert.doesNotMatch(panel, /data-demand-feature=\"aiops\"[^\n]*\.remove\(\)/);
  assert.match(panel, /AI 회원운영/);
  assert.match(panel, /회원단계/);
  assert.match(panel, /AI 허용량/);
  assert.match(panel, /사용량/);
  assert.match(panel, /비용/);
  assert.match(panel, /AI 경로 상태/);
  assert.match(panel, /상태/);
  assert.match(panel, /실행 정책/);
  assert.match(panel, /Core 우선/);
  assert.match(panel, /개인 API 여부/);
  assert.match(panel, /\/api\/control\/ai\/provider-status/);
  assert.match(panel, /\/api\/control\/user-ai/);

  assert.match(build, /readFile\(`\$\{root\}user-ai-tier-panel\.js`/);
  assert.match(build, /writeFile\(`\$\{output\}ai-ops-admin\.js`/);
  assert.match(deploy, /- 'user-ai-tier-panel\.js'/);
});
