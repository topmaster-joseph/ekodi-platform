import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallSocialSetup } from '../mall-social-setup.js';
import { workspaceAdminScript, workspaceAdminCss } from '../workspace-admin-page.js';

const src = readFileSync(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('EKODI Mall presents four SNS channels and a clear connection-to-publish sequence', () => {
  const html = renderMallSocialSetup({ platform: { youtubeConfigured: true, metaConfigured: false, threadsConfigured: false } });
  for (const id of ['facebook', 'instagram', 'threads', 'youtube']) assert.match(html, new RegExp('data-mall-provider="' + id + '"'));
  assert.match(html, /연결 확인/);
  assert.match(html, /정책 저장/);
  assert.match(html, /시험 발행/);
  assert.match(html, /결과 검증/);
  assert.match(html, /앱 등록 안내/);
  assert.match(html, /data-channel-quick="youtube"/);
  assert.match(html, /data-channel-quick="facebook" disabled/);
});

test('only real active OAuth connections are shown as connected', () => {
  const html = renderMallSocialSetup({
    platform: { youtubeConfigured: true, metaConfigured: true, threadsConfigured: true },
    registeredAccounts: [{ provider: 'facebook', status: 'active' }],
    connections: [{ provider: 'youtube', status: 'active', display_name: 'Official' }],
    channels: [{ provider: 'youtube', status: 'active', config: { autoPublishEnabled: false } }],
    policy: { mode: 'review' },
  });
  assert.match(html, /OAuth 연결 1개/);
  assert.match(html, /OAuth 연결 완료/);
  assert.match(html, /계정 인증 필요/);
  assert.match(html, /발행 모드<\/b> 검토 후 게시/);
  assert.match(html, /자동 집행 OFF/);
});

test('external display names are HTML-escaped and no provider credentials are ever requested', () => {
  const html = renderMallSocialSetup({
    platform: { metaConfigured: false },
    connections: [{ provider: 'facebook', status: 'active', display_name: '<script>alert(1)</script>' }],
  });
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /name="(?:token|clientSecret|password)"/);
  assert.match(html, /Secret을 입력하지 않습니다/);
});

test('admin JS includes inline settings, deliberate test publishing, and working canonical service paths', async () => {
  assert.match(src, /const GROWTH_API='\/marketing-connect-api'/);
  assert.match(src, /const CHANNEL_AUTOMATION='\/marketing-publish-api'/);
  assert.match(src, /renderMallSocialSetup\(\{platform,connections,registeredAccounts,channels:publishChannels,jobs,policy\}\)/);
  assert.match(src, /id="mallSocialTestForm"/);
  assert.match(src, /window\.confirm\('선택한 SNS/);
  assert.match(src, /automationApi\('\/v1\/publish'/);
  assert.match(src, /requestedBy:'human'/);
  assert.match(src, /실제 발행 성공 여부는 아래 최근 게시 작업에서 확인/);
  const script = await workspaceAdminScript().text();
  assert.match(script, /function renderMallSocialSetup/);
  assert.match(script, /mallSocialTestForm/);
  // Verify the generated browser script parses without invoking DOM in the test runner.
  assert.doesNotThrow(() => new Function(script));
});

test('one-screen CSS is responsive and the controls stay on the existing administrator route', async () => {
  const css = await workspaceAdminCss().text();
  assert.match(css, /\.mall-social-providers/);
  assert.match(css, /\.mall-social-test/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(src, /channel-settings/);
  assert.doesNotMatch(src, /const GROWTH_API='https:\/\/marketing-connect-api\.ekodi\.kr'/);
});

test('a merged Mall admin UI change dispatches the protected site-core production workflow', () => {
  const orchestrator = readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  assert.ok(orchestrator.includes("file==='workspace-admin-page.js'"));
  assert.ok(orchestrator.includes("file==='mall-social-setup.js'"));
  assert.ok(orchestrator.includes('if(sharedSiteTouched)'));
  assert.ok(orchestrator.includes('/actions/workflows/deploy-site-core.yml/dispatches'));
  assert.ok(orchestrator.includes('release_branch_ref:branch,release_task_id:taskId'));
  assert.ok(src.includes("textContent=service==='mall'?'SNS 통합 설정'"));
});
