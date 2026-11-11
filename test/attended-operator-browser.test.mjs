// Constitution v1.27.9 §1D-1 ATTENDED-OPERATOR-BROWSER-001 enforcement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  POLICY_ID, RECIPES, FORBIDDEN_INITIATOR_ENV, assertOperatorStart, getRecipe, navigationAllowed,
  redact, extractClientSecret, renderPlan, makeAudit,
} from '../tools/ekodi-device-agent/windows/ekodi-attended-browser.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const constitution = JSON.parse(read('governance/constitution/constitution.json'));
const policy = constitution.attendedOperatorBrowserPolicy;
const FAKE = 'GOCSPX-' + 'a1B2c3D4e5F6g7H8i9J0kLmN';

test('constitution v1.27.9 records a bounded, owner-approved attended mode that is not automatic execution', () => {
  assert.equal(constitution.version, '1.27.10');
  assert.ok(constitution.principles.includes('attended-operator-browser-bounded'));
  assert.equal(policy.id, POLICY_ID);
  assert.equal(policy.isAutomaticExecution, false);
  assert.equal(policy.automaticExecutionLifecycleUnchanged, 'AUTOMATIC-EXECUTION-LIFECYCLE-001');
  assert.equal(constitution.automaticExecutionLifecyclePolicy.defaultExecutionMode, 'background-only');
  assert.equal(policy.reuseUserBrowserProfile, false);
  assert.equal(policy.profileDeletedOnExit, true);
  assert.equal(policy.runnerHandlesPasswordsOrOtp, false);
  assert.equal(policy.perStepOperatorApprovalForStateChanges, false);
  assert.equal(policy.runLevelOperatorApproval, true);
  assert.equal(policy.ekodiPlatformOriginAlwaysAllowed, 'https://ekodi.kr');
  assert.equal(policy.secretTransfer.persistToDisk, false);
  assert.equal(policy.secretTransfer.sendToEkodiServicesOrChat, false);
  assert.ok(policy.forbiddenInitiators.includes('orchestrator'));
  const amendment = JSON.parse(read(policy.amendmentRecords[0]));
  const runLevel = JSON.parse(read(policy.amendmentRecords[1]));
  assert.equal(runLevel.status, 'approved'); assert.equal(runLevel.constitutionVersion, '1.27.10'); assert.equal(runLevel.approvalScope.aiMayStartAttendedRuns, false);
  assert.equal(amendment.status, 'approved');
  assert.equal(amendment.approvedBy, 'topmaster-joseph');
  assert.equal(amendment.approvalScope.aiMayStartAttendedRuns, false);
  assert.equal(amendment.approvalScope.automaticExecutionWeakened, false);
  assert.match(read('CONSTITUTION.md'), /## 1D-1\. Attended Operator Browser Constitution \(v1\.27\.9, amended v1\.27\.10/);
});

test('only an interactive operator may start it; agents, CI, schedulers and remote jobs are refused', () => {
  const tty = { isTTY: true };
  assert.equal(assertOperatorStart({ env: {}, stdin: tty }), true);
  for (const key of FORBIDDEN_INITIATOR_ENV) assert.throws(() => assertOperatorStart({ env: { [key]: '1' }, stdin: tty }), /ATTENDED_FORBIDDEN_INITIATOR/);
  assert.throws(() => assertOperatorStart({ env: {}, stdin: { isTTY: false } }), /ATTENDED_REQUIRES_INTERACTIVE_OPERATOR/);
});

test('no other EKODI code imports, spawns or schedules the attended runner', () => {
  const allowed = new Set(['tools/ekodi-device-agent/windows/ekodi-attended-browser.mjs', 'tools/ekodi-device-agent/windows/ekodi-attended-gmail-notify.cmd',
    'test/attended-operator-browser.test.mjs', 'CONSTITUTION.md', 'governance/constitution/constitution.json', 'governance/amendments/2026-11-11-attended-operator-browser-v1.27.9.json', 'governance/amendments/2026-11-11-attended-browser-run-level-v1.27.10.json']);
  const skip = new Set(['node_modules', '.git', 'dist', 'generated', '.wrangler', 'artifacts']);
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const full = path.join(dir, name); const rel = path.relative(root.pathname, full).split(path.sep).join('/');
      const st = statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!/\.(m?js|ts|ps1|cmd|bat|ya?ml|json|toml|sh)$/.test(name) || st.size > 3_000_000) continue;
      if (!allowed.has(rel) && readFileSync(full, 'utf8').includes('ekodi-attended-browser')) offenders.push(rel);
    }
  };
  walk(root.pathname);
  assert.deepEqual(offenders, []);
});

test('recipes are registered, https-only, include the EKODI Platform origin, and are approved once per run', () => {
  assert.throws(() => getRecipe('anything-else'), /ATTENDED_RECIPE_NOT_REGISTERED/);
  assert.throws(() => getRecipe('__proto__'), /ATTENDED_RECIPE_NOT_REGISTERED/);
  for (const [id, recipe] of Object.entries(RECIPES)) {
    assert.ok(recipe.origins.includes('https://ekodi.kr'), id + ' must allow the EKODI Platform');
    assert.ok(Object.isFrozen(recipe) && Object.isFrozen(recipe.steps) && Object.isFrozen(recipe.origins), id);
    for (const o of recipe.origins) assert.match(o, /^https:\/\/[a-z0-9.-]+$/);
    const ids = recipe.steps.map((s) => s.id); assert.equal(new Set(ids).size, ids.length);
    for (const s of recipe.steps) {
      assert.ok(navigationAllowed(s.url, recipe), `${id}/${s.id} url must be on recipe origins`);
      if (['click', 'insert-text', 'capture-secret', 'store-secret'].includes(s.kind)) assert.equal(s.changesState, true, s.id);
    }
  }
  const gmail = getRecipe('gmail-operator-notify');
  assert.deepEqual({ ...gmail.secretDestination }, { kind: 'github-actions-secret', repo: 'topmaster-joseph/ekodi-platform', name: 'MAIL_GOOGLE_CLIENT_SECRET' });
  assert.ok(gmail.steps.findIndex((s) => s.kind === 'capture-secret') < gmail.steps.findIndex((s) => s.kind === 'store-secret'));
  assert.match(renderPlan(gmail), /시작할 때 한 번만 승인/);
  const src = read('tools/ekodi-device-agent/windows/ekodi-attended-browser.mjs');
  assert.doesNotMatch(src, /이 단계를 실행할까요/);
  assert.match(src, /위 작업 전체를 한 번에 승인하고 시작할까요/);
  assert.equal(gmail.steps.at(-1).id, 'ekodi-connect-gmail');
});

test('main-frame navigation is confined to recipe origins', () => {
  const r = getRecipe('gmail-operator-notify');
  assert.equal(navigationAllowed('https://console.cloud.google.com/apis', r), true);
  assert.equal(navigationAllowed('https://github.com/login', r), true);
  assert.equal(navigationAllowed('https://evil.example/', r), false);
  assert.equal(navigationAllowed('http://github.com/', r), false);
  assert.equal(navigationAllowed('https://user:pw@github.com/', r), false);
  assert.equal(navigationAllowed('javascript:alert(1)', r), false);
  assert.equal(navigationAllowed('https://gstatic.example/frame', r, { mainFrame: false }), true);
  assert.equal(navigationAllowed('http://insecure.example/frame', r, { mainFrame: false }), false);
});

test('secrets are captured only when unambiguous and are never printable or auditable', async () => {
  assert.equal(extractClientSecret(`보안 비밀번호 ${FAKE} 복사`), FAKE);
  assert.equal(extractClientSecret('no secret here'), null);
  assert.equal(extractClientSecret(`${FAKE} and GOCSPX-${'z'.repeat(24)}`), null);
  assert.doesNotMatch(redact(`value ${FAKE}`), /GOCSPX-/);
  assert.deepEqual(redact({ step: 'x', secret: FAKE, nested: { value: 'v', note: FAKE } }), { step: 'x', secret: '[REDACTED]', nested: { value: '[REDACTED]', note: '[REDACTED]' } });
  const lines = [];
  const audit = makeAudit({ dir: '/tmp/x', runId: 'r1', ensure: async () => {}, write: async (_p, line) => { lines.push(line); } });
  await audit({ event: 'step', step: 'create-client-secret', detail: FAKE, secret: FAKE });
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /GOCSPX-/);
  assert.match(lines[0], /"policy":"ATTENDED-OPERATOR-BROWSER-001"/);
});

test('runner source keeps secrets out of Runtime.evaluate, disk writes and console output', () => {
  const src = read('tools/ekodi-device-agent/windows/ekodi-attended-browser.mjs');
  assert.match(src, /Input\.insertText', \{ text: secret \}/);
  assert.doesNotMatch(src, /evalJs\([^)]*secret\b/);
  assert.doesNotMatch(src, /console\.log\([^)]*secret/);
  assert.doesNotMatch(src, /writeFile\(/);
  assert.match(src, /--user-data-dir=\$\{profile\}/);
  assert.match(src, /rm\(profile, \{ recursive: true, force: true \}\)/);
  assert.match(src, /mkdtemp\(/);
  assert.doesNotMatch(src, /User Data|Default\\\\|--profile-directory/);
});
