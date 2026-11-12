import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const yml = await readFile(new URL('../.github/workflows/verify-singles-native-browser.yml', import.meta.url), 'utf8');
const worker = await readFile(new URL('../.github/workflows/ekodi-background-browser-worker.yml', import.meta.url), 'utf8');
const batches = [...yml.matchAll(/^\s*surface_paths: '([^']+)'$/gm)].map(match => match[1].split(','));
const lanes = [...yml.matchAll(/^\s*verification_lane: ([\w-]+)$/gm)].map(match => match[1]);
const routes = [
  '/singles', '/singles/my', '/singles/groups', '/singles/events',
  '/singles/discover', '/singles/messages', '/singles/subscribe', '/singles/admin',
  '/singles/api/status', '/auth/?site=singles&return_to=https%3A%2F%2Fekodi.kr%2Fsingles%2Fmy',
  '/singles/privacy', '/singles/terms', '/singles/verify',
];

test('Donghaeng acceptance only runs after a successful guarded Site Core release, or an explicit dispatch', () => {
  assert.match(yml, /workflow_run:\s*\n\s*workflows: \["Deploy EKODI Shared Site Core"\]/);
  assert.equal((yml.match(/github\.event\.workflow_run\.conclusion == 'success'/g) || []).length, 2);
  assert.equal((yml.match(/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/g) || []).length, 2);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /cancel-in-progress: false/);
});

test('two browser lanes cover all thirteen distinct routes while preserving the native worker twelve-path cap', () => {
  assert.equal((yml.match(/uses: \.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g) || []).length, 2);
  assert.match(worker, /const maxPaths=Math\.min\(12,registryMaxPaths\)/);
  assert.equal(batches.length, 2);
  for (const batch of batches) {
    assert.ok(batch.length >= 1 && batch.length <= 12, 'bounded worker rejects >12 paths');
    assert.equal(new Set(batch).size, batch.length, 'a lane must not waste budget on duplicates');
    assert.ok(batch.every(route => route.startsWith('/')), 'all routes must be canonical root-relative');
  }
  assert.deepEqual([...new Set(batches.flat())].sort(), [...routes].sort());
  assert.equal(batches.flat().length, routes.length, 'each route should have exactly one lane');
});

test('member and legal lanes execute on both devices without cross-cancelling their jobs', () => {
  assert.equal((yml.match(/matrix:\s*\n\s*device_profile: \[desktop, mobile-portrait\]/g) || []).length, 2);
  assert.equal((yml.match(/device_profile: \$\{\{ matrix\.device_profile \}\}/g) || []).length, 2);
  assert.equal((yml.match(/fail-fast: false/g) || []).length, 2);
  assert.deepEqual(lanes.sort(), ['singles-legal', 'singles-member']);
  assert.equal(new Set(lanes).size, 2, 'worker cancel-in-progress must have independent lane keys');
  assert.match(worker, /inputs\.verification_lane \|\| 'generic'/);
  assert.ok(batches.some(batch => ['/singles/privacy','/singles/terms','/singles/verify'].every(route => batch.includes(route))));
});

test('native acceptance is read-only and preserves login, payment, age and PII boundaries', () => {
  assert.doesNotMatch(yml, /use_vault|external\.browser|tinyfish|E2E_ADMIN_TOKEN/i);
  assert.doesNotMatch(yml, /SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|SINGLES_M1_ENABLED:\s*true|SINGLES_PAID_ACTIONS_ENABLED:\s*true/);
  assert.ok(!/\b(secrets:|write-all|POST|DELETE|PATCH|PUT)\b/i.test(yml), 'no live mutation or privileged secret injection');
});


test('a Singles native browser workflow-only update dispatches the guarded Site Core release first', async () => {
  const release = await readFile(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url), 'utf8');
  const match = release.match(/const sharedSiteTouched=changedFiles\.some\(file=>([\s\S]*?)\n\);/);
  assert.ok(match, 'guarded release change classifier must remain present');
  assert.ok(match[1].includes("file==='.github/workflows/verify-singles-native-browser.yml'||"),
    'a workflow-only browser verification fix must not become an unverified merge');
  assert.match(release, /if\(sharedSiteTouched\)\{\s*const dispatch=await api\('\/actions\/workflows\/deploy-site-core\.yml\/dispatches'/);
  assert.match(yml, /workflow_run:\s*\n\s*workflows: \["Deploy EKODI Shared Site Core"\]/,
    'Singles acceptance can only follow the guarded production release');
  assert.match(yml, /github\.event\.workflow_run\.conclusion == 'success'/);
});


test('guarded Site Core runs four sequential native Singles checks and requires each in final receipt', async () => {
  const site = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
  const cases = [
    ['singles_native_member_desktop', 'authenticated_admin_surface_verification', 'desktop', 'singles-member', batches[0]],
    ['singles_native_member_mobile', 'singles_native_member_desktop', 'mobile-portrait', 'singles-member', batches[0]],
    ['singles_native_legal_desktop', 'singles_native_member_mobile', 'desktop', 'singles-legal', batches[1]],
    ['singles_native_legal_mobile', 'singles_native_legal_desktop', 'mobile-portrait', 'singles-legal', batches[1]],
  ];
  assert.equal(cases.length, 4);
  assert.equal(batches[0].length + batches[1].length, 13);
  for (const [name, prev, profile, lane, routes] of cases) {
    const section = site.split('\n  ' + name + ':\n')[1]?.split(/\n  [a-z][a-z0-9_]*:\n/)[0];
    assert.ok(section, 'missing browser job: ' + name);
    assert.ok(section.includes('needs: [deploy, ' + prev + ']'), 'ordered release-success dependency missing: ' + name);
    assert.ok(section.includes('uses: ./.github/workflows/ekodi-background-browser-worker.yml'), 'must use first-party Chromium');
    assert.ok(section.includes('verification_lane: ' + lane), 'must retain isolated cancellation group');
    assert.ok(section.includes('device_profile: ' + profile), 'wrong device');
    assert.ok(section.includes("surface_paths: '" + routes.join(',') + "'"), 'native routes drifted: ' + name);
    assert.ok(routes.length <= 12, 'browser worker path budget violated');
    const varName = name.toUpperCase() + '_RESULT';
    assert.ok(site.includes(varName + ': $' + '{{ needs.' + name + '.result }}'), 'required outcome missing from receipt env');
    assert.ok(site.includes("['" + name + "',process.env." + varName + "]"), 'result missing from receipt evaluation');
  }
  const receipt = site.split('\n  post_promotion_browser_verification_receipt:\n')[1];
  assert.ok(receipt, 'postpromotion receipt job missing');
  const needs = receipt.match(/^\s*needs: \[([^\]]+)\]/m)?.[1].split(',').map(v => v.trim());
  assert.ok(needs?.includes('scheduled_release_gate'));
  for (const [name] of cases) assert.ok(needs.includes(name), 'release receipt cannot skip: ' + name);
  assert.match(receipt, /const firstFailure=jobs\.find\(\(\[name,state\]\)=>state!=='success'\)/,
    'a failed or skipped Singles browser job must block the verified receipt');
  assert.match(receipt, /if\(gateProceed==='false'\)/, 'scheduled no-op must not falsely fail');
});


test('guest identity page must finish initialization on both protected desktop and mobile browser lanes', async () => {
  const release = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
  const workerWorkflow = await readFile(new URL('../.github/workflows/ekodi-background-browser-worker.yml', import.meta.url), 'utf8');
  const ready = "expected_visible_selector: '#verifyStatus + a.primary[href*=\"/auth/\"]'";
  for (const name of ['singles_native_legal_desktop', 'singles_native_legal_mobile']) {
    const section = release.split('\n  ' + name + ':\n')[1]?.split(/\n  [a-z][a-z0-9_]*:\n/)[0];
    assert.ok(section?.includes(ready), 'guest ready-state must be checked: ' + name);
    assert.ok(section.includes("surface_paths: '/singles/privacy,/singles/terms,/singles/verify'"));
  }
  const legal = yml.split('\n  legal:\n')[1];
  assert.ok(legal?.includes(ready), 'standalone legal acceptance must await initialized identity UI');
  assert.match(workerWorkflow, /expected_visible_selector:/);
  assert.match(workerWorkflow, /type:'waitFor',selector:expectedVisible,timeoutMs:12000/);
  assert.match(workerWorkflow, /type:'snapshot'/);
  assert.match(workerWorkflow, /expectedVisible\?2:0/);
  assert.match(workerWorkflow, /if\(actions\.length>30\) throw new Error\('browser task exceeds native maxActions=30'\)/);
  assert.doesNotMatch(workerWorkflow, /allowMutation:true|type:'click'.*verifyStart/);
});
