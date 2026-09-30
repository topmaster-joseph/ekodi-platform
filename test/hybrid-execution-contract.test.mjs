import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hybrid, mission, migration, fabricMigration, admin, thinPostbuild, controlDeploy] = await Promise.all([
  readFile(new URL('../hybrid-execution.js', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0040_hybrid_execution.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0058_execution_fabric_settings.sql', import.meta.url), 'utf8'),
  readFile(new URL('../hybrid-execution-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/admin-thin-postbuild.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8'),
]);

test('hybrid queue is cloud-owned and new nodes default to auto execution off', () => {
  assert.match(hybrid, /auto_execute,\s*enabled[\s\S]*VALUES \(\?, 0, 1,/);
  assert.match(migration, /auto_execute INTEGER NOT NULL DEFAULT 0/);
});

test('execution fabric has one confirmed global assignment gate without interrupting leased work', () => {
  assert.match(fabricMigration, /CREATE TABLE IF NOT EXISTS hybrid_execution_settings/);
  assert.match(fabricMigration, /enabled INTEGER NOT NULL DEFAULT 1/);
  assert.match(hybrid, /EXECUTION_FABRIC_CONFIRM_REQUIRED/);
  assert.match(hybrid, /EXECUTION_FABRIC_SUPER_ADMIN_REQUIRED/);
  assert.match(hybrid, /auth\.session\.role !== 'super_admin'/);
  assert.match(hybrid, /last_error='fabric_paused'/);
  assert.match(hybrid, /WHERE status='assigned'/);
  assert.match(hybrid, /pauseKeepsLeasedJobsRunning:true/);
  assert.match(admin, /id="toggleHybridFabric"/);
  assert.match(admin, /\/api\/control\/hybrid-execution\/settings/);
});

test('hybrid execution hard-limits retries to three attempts', () => {
  assert.match(hybrid, /const MAX_ATTEMPTS = 3/);
  assert.match(migration, /max_attempts INTEGER NOT NULL DEFAULT 3 CHECK \(max_attempts BETWEEN 1 AND 3\)/);
  assert.match(migration, /attempt_count INTEGER NOT NULL DEFAULT 0 CHECK \(attempt_count BETWEEN 0 AND 3\)/);
});

test('hybrid tasks are a closed predefined allowlist without arbitrary shell hooks', () => {
  assert.match(hybrid, /const TASK_POLICIES = Object\.freeze/);
  assert.doesNotMatch(hybrid, /child_process|execSync|spawnSync|new Function|eval\(/);
  assert.match(hybrid, /arbitraryShell:false/);
  assert.doesNotMatch(hybrid, /'shell\./);
});

test('scheduler uses online freshness, capability, group, load and concurrency', () => {
  assert.match(hybrid, /ONLINE_MS = 90 \* 1000/);
  assert.match(hybrid, /nodeSupports\(node, job\)/);
  assert.match(hybrid, /safeGroup\(node\.device_group\)/);
  assert.match(hybrid, /current_load/);
  assert.match(hybrid, /compareLocalExecutionCandidates/);
  assert.match(hybrid, /resource\.autoExecutionEligible === true/);
  assert.match(hybrid, /resource\.isPortable === false/);
  assert.match(hybrid, /active >= Math\.max\(1, Number\(node\.max_concurrency\)/);
});

test('lease expiry and failures requeue work and avoid the previous node when alternatives exist', () => {
  assert.match(hybrid, /lease_expired/);
  assert.match(hybrid, /last_device_id=assigned_device_id/);
  assert.match(hybrid, /candidates\.filter\(node => node\.device_id !== job\.last_device_id\)/);
  assert.match(hybrid, /status='pending'/);
});

test('legacy agent bridge only falls back to hybrid work when the existing queue is empty', () => {
  assert.match(mission, /handleDeviceControl\(request, env\)/);
  assert.match(mission, /if \(!body\?\.command\)/);
  assert.match(mission, /claimHybridFallback\(request, env\)/);
  assert.match(mission, /hyb_\[\^\/\]\+/);
  assert.match(mission, /handleHybridAgentResult/);
});

test('admin control exposes node policy, execution records and audit state without enabling nodes automatically', () => {
  assert.match(admin, /새 Worker의 자동 실행은 기본 OFF/);
  assert.match(admin, /data-auto/);
  assert.match(admin, /maxConcurrency/);
  assert.match(admin, /실행 인프라 · 작업 관제/);
  assert.match(admin, /감사 이벤트/);
  assert.match(admin, /hybridStatusFilter/);
  assert.match(admin, /전체 진단 자동배정/);
});

test('production admin postbuild bundles hybrid admin into on-demand Device Control', () => {
  assert.match(thinPostbuild, /hybrid-execution-admin\.js/);
  assert.match(thinPostbuild, /const hybridExecutionJs/);
  assert.match(thinPostbuild, /`\$\{deviceJs\}\\n\$\{hybridExecutionJs\}\\n`/);
  assert.match(thinPostbuild, /writeFile\(`\$\{dist\}device-control-admin\.js`/);
});

test('migration creates durable node, job and event ledgers with queue indexes', () => {
  for (const table of ['hybrid_execution_nodes','hybrid_execution_jobs','hybrid_execution_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /idx_hybrid_jobs_queue/);
  assert.match(migration, /idx_hybrid_jobs_device/);
  assert.match(migration, /idx_hybrid_events_job/);
});

test('automatic browser jobs are hard-routed to background-only execution and never open user tabs', () => {
  assert.match(hybrid, /'computer\.browser\.execute': \{ capability:'backgroundBrowser', risk:'maintain', confirm:true, payload:'background-browser-task', executionMode:'background-only' \}/);
  assert.match(hybrid, /policy\.payload === 'background-browser-task'/);
  assert.match(hybrid, /executionMode:'background-only'/);
  assert.match(hybrid, /createUserBrowserTab:false/);
  assert.match(hybrid, /closeOwnedSurfaceOnComplete:true/);
  assert.match(hybrid, /closeOwnedSurfaceOnAuthRequired:true/);
  assert.match(hybrid, /preserveUserOwnedSurfaces:true/);
  assert.match(hybrid, /claimedPayload=sanitizePayload\(job\.task_type/);
  assert.match(hybrid, /stored_payload_invalid/);
});

test('background authentication requirements terminate without retry or interactive login', () => {
  assert.match(hybrid, /SET status='completed', result_json=\?, last_error='AUTH_REQUIRED'/);
  assert.match(hybrid, /status:row\.last_error === 'AUTH_REQUIRED' \? 'auth_required' : row\.status/);
  assert.match(hybrid, /last_error='AUTH_REQUIRED'/);
  assert.match(hybrid, /retrying:false/);
  assert.match(hybrid, /interactiveLoginOpened:false/);
  assert.match(hybrid, /userBrowserTabCreated:false/);
  assert.match(hybrid, /authRequiredJobs:jobs\.filter\(job => job\.status === 'auth_required'\)\.length/);
});

test('hybrid policy publishes the background-only browser invariant', () => {
  assert.match(hybrid, /automaticBrowserExecution:'background-only'/);
  assert.match(hybrid, /userBrowserTabCreation:false/);
  assert.match(hybrid, /authRequiredDisposition:'record-and-close'/);
  assert.match(hybrid, /preserveUserOwnedSurfaces:true/);
  assert.match(admin, /auth_required:'인증 필요'/);
  assert.match(admin, /<option value="auth_required">인증 필요<\/option>/);
  assert.match(admin, /id="hybridAuthRequiredJobs"/);
});


test('auth-required projection remains compatible with the existing durable D1 status constraint', () => {
  assert.match(migration, /CHECK \(status IN \('pending','assigned','leased','completed','failed','cancelled'\)\)/);
  assert.doesNotMatch(migration, /auth_required/);
  assert.match(hybrid, /last_error='AUTH_REQUIRED'/);
  assert.match(hybrid, /status:row\.last_error === 'AUTH_REQUIRED' \? 'auth_required' : row\.status/);
});


test('hybrid runtime changes trigger the guarded Control API release path', () => {
  const triggerCount = controlDeploy.split("- 'hybrid-execution.js'").length - 1;
  assert.equal(triggerCount, 2, 'hybrid-execution.js must trigger both pull-request staging and main production release');
  assert.match(controlDeploy, /push:[\s\S]*branches: \[main\][\s\S]*hybrid-execution\.js/);
  assert.match(controlDeploy, /pull_request:[\s\S]*hybrid-execution\.js/);
  assert.doesNotMatch(controlDeploy, /pull_request_target:/);
});


test('execution admin visibly communicates the enforced background-only automation lifecycle', () => {
  assert.match(admin, /id="hybridAutomationPolicy"/);
  assert.match(admin, /data-execution-mode="background-only"/);
  assert.match(admin, /자동실행은 백그라운드 전용/);
  assert.match(admin, /사용자 탭 생성/);
  assert.match(admin, /임시 실행면 자동종료/);
  assert.match(admin, /AUTH_REQUIRED 기록 후 종료/);
  assert.match(admin, /사용자 창·탭/);
  assert.match(admin, /OAuth · CAPTCHA · OS 권한/);
  assert.match(admin, /'computer\.browser\.execute':'백그라운드 브라우저 자동실행'/);
});
