import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical admin deep links restore even when post-auth layout loads after admin-ready', () => {
  const layout = read('admin-menu-layout.js');
  const sidebar = read('admin-sidebar.js');
  assert.match(layout, /else if\(initialSection\)\{[\s\S]*queueMicrotask\(\(\)=>\{if\(requestedSection!==initialSection\)return;if\(!activatePanel\(initialSection\)\)requestDemand\(initialSection\);\}\)/);
  assert.match(sidebar, /if \(routed && getAdminMenuItem\(routed\)\) return routed;/);
});

test('public Community surfaces use ekodi.kr/community instead of the retired subdomain', () => {
  const retiredHost = ['community','ekodi','kr'].join('.');
  const retiredUrl = new RegExp('https:\\/\\/' + retiredHost.replaceAll('.', '\\\\.') );
  const files = [
    'index.html',
    'community-admin.js',
    'author-worker.js',
    'social/index.html',
    'life/index.html',
    'my/app.js',
    'scripts/build.mjs',
    'scripts/monitor-lib.mjs',
    'api-worker.js',
    'auth-site/auth.js',
    'auth-site/auth-workspace-target.js',
    'ai-ops-admin.js',
    'admin-lazy-features.js',
    'campus-actions.js',
    'release-control-admin.js',
    'admin-service-handoffs.js',
    'supabase/functions/connect-api/index.ts',
    'supabase/functions/access-api/index.ts',
    'tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',
    'platform-boundaries.json',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), retiredUrl, file);
  }
  assert.match(read('index.html'), /https:\/\/ekodi\.kr\/community/);
  assert.match(read('.github/workflows/deploy.yml'), /https:\/\/ekodi\.kr\/community\/health/);
});

test('Community auth and CORS trust the canonical EKODI origin', () => {
  const auth = read('auth-site/auth.js');
  const workspaceTarget = read('auth-site/auth-workspace-target.js');
  const connectApi = read('supabase/functions/connect-api/index.ts');
  const accessApi = read('supabase/functions/access-api/index.ts');
  assert.match(auth, /returnTo:'https:\/\/ekodi\.kr\/community',origins:\['https:\/\/ekodi\.kr'\]/);
  assert.match(workspaceTarget, /community:\['https:\/\/ekodi\.kr'\]/);
  assert.match(connectApi, /const ORIGINS = new Set\(\["https:\/\/ekodi\.kr"/);
  assert.match(accessApi, /community:\["https:\/\/ekodi\.kr"\]/);
});