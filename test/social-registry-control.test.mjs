import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_REGISTRY, normalizeRegistry } from '../social-registry-api.js';

test('Social registry normalizes the canonical EKODI organizations', () => {
  const registry = normalizeRegistry(DEFAULT_REGISTRY);
  assert.equal(registry.version, 3);
  assert.ok(registry.organizations.some(org => org.id === 'community' && org.name === '커뮤니티'));
  assert.ok(registry.organizations.some(org => org.id === 'church'));
  assert.ok(registry.organizations.every(org => org.website.startsWith('https://')));
  assert.ok(registry.organizations.flatMap(org => org.channels).every(channel => channel.id && channel.url.startsWith('https://')));
});

test('Social registry rejects insecure channel URLs and duplicate organizations', () => {
  assert.throws(() => normalizeRegistry({ organizations: [{ id:'x', name:'X', website:'https://x.example', channels:[{ provider:'other', label:'X', url:'http://x.example' }] }] }), /https/);
  assert.throws(() => normalizeRegistry({ organizations: [
    { id:'same', name:'A', website:'https://a.example', channels:[] },
    { id:'same', name:'B', website:'https://b.example', channels:[] }
  ] }), /duplicate organization id/);
});

test('Social registry rejects the retired EKODI mission organization label', () => {
  assert.throws(() => normalizeRegistry({ organizations: [{ id:'mission', name:'에코디선교회', website:'https://community.ekodi.kr', channels:[] }] }), /legacy EKODI mission/);
});

test('Social workspace switcher consumes one-time handoff and revalidates person workspace', async () => {
  const [html,app,worker]=await Promise.all([
    readFile(new URL('../social/index.html',import.meta.url),'utf8'),
    readFile(new URL('../social/app.js',import.meta.url),'utf8'),
    readFile(new URL('../social-worker.js',import.meta.url),'utf8'),
  ]);
  assert.match(html,/id="workspaceSwitch"/);
  assert.match(app,/functions\/v1\/workspace-api/);
  assert.match(app,/\$\{WORKSPACE_API\}\/workspaces\?site=social/);
  assert.match(app,/verifyOtp\(\{token_hash:token/);
  assert.match(app,/ekodi_workspace/);
  assert.match(app,/workspace_key===key/);
  assert.match(app,/my\.ekodi\.kr/);
  assert.match(app,/return_to/);
  assert.match(worker,/script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(worker,/connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
});

test('Control Center lazy-loads Social Channels while security-wrapped Mission Control preserves the canonical API entry', async () => {
  const [features, build, admin, entry, missionEntry, wrangler, sharedDeploy] = await Promise.all([
    readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../social-admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(features, /social:\s*\{[^}]*styles:\['social-admin\.css'\][^}]*scripts:\['social-admin\.js'\]/);
  assert.match(features, /hashes:\['#social'\]/);
  assert.match(build, /social-admin\.css/);
  assert.match(build, /social-admin\.js/);
  assert.match(admin, /content\.querySelector\('\[data-panel~="social"\]'\)/);
  assert.match(admin, /nav\.querySelector\('\[data-section="social"\], \[data-lazy-section="social"\]'\)/);
  assert.doesNotMatch(admin, /document\.querySelector\('\[data-section="social"\]'\)\) return/);
  assert.ok(sharedDeploy.includes("- 'social-admin.js'"));
  assert.ok(sharedDeploy.includes("- 'social-admin.css'"));
  assert.match(sharedDeploy, /client-access\.js social-admin\.js [^\r\n]*books-admin\.js/);
  assert.match(admin, /\/api\/control\/social\/registry/);
  assert.match(entry, /handleSocialRegistry/);
  assert.match(entry, /\/api\/social\/registry/);
  assert.match(entry, /return apiWorker\.fetch\(request, env, ctx\)/);
  assert.match(entry, /return apiWorker\.scheduled\(controller, env, ctx\)/);
  assert.match(wrangler, /main = "mission-control-entry-worker\.js"/);
  assert.match(missionEntry, /const response = await customerEntryWorker\.fetch\(request, env, ctx\)/);
  assert.match(missionEntry, /return applyApiSecurityHeaders\(response\)/);
  assert.match(missionEntry, /const guard = await enforceEdgeSecurity\(request, env\)/);
  assert.match(missionEntry, /return customerEntryWorker\.scheduled\(controller, env, ctx\)/);
});