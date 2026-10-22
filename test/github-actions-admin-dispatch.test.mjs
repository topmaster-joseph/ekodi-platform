
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Actions executor is super-admin-only and cannot use inventory credentials for execution', async () => {
  const source = await read('cloudflare-secret-control.js');
  assert.match(source, /const auth = await sessionCheck\(request, env\)/);
  assert.match(source, /SECRET_MANAGER_FORBIDDEN/);
  assert.match(source, /ACTIONS_SUPER_ADMIN_REQUIRED/);
  assert.match(source, /auth\.session\.role/);
  assert.match(source, /GITHUB_ACTIONS_DISPATCH_TOKEN/);
  const credentialFunction = source.slice(source.indexOf('function actionsCredential('), source.indexOf('function actionsConnectionStatus('));
  assert.doesNotMatch(credentialFunction, /GITHUB_CONTROL_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN/);
});

test('workflow execution is limited to two fixed safe jobs, fixed main ref and explicit confirmation', async () => {
  const source = await read('cloudflare-secret-control.js');
  const scope = source.slice(source.indexOf('const ACTIONS_REPOSITORY'), source.indexOf('function json('));
  for (const id of ['cloudflare-production-usage-diagnose.yml','traffic-intelligence-analytics.yml']) assert.ok(scope.includes(id));
  for (const forbidden of ['deploy.yml','deploy-site-core.yml','repair-cloudflare-access-scope.yml']) {
    assert.equal(source.includes("id:'" + forbidden + "'"), false);
  }
  assert.match(source, /Object\.keys\(input \|\| \{\}\)\.some\(key => key !== 'workflow'\)/);
  assert.match(source, /x-ekodi-confirm-impact/);
  assert.match(source, /method:'POST'/);
  assert.match(source, /body:JSON\.stringify\(\{ ref:'main' \}\)/);
  assert.match(source, /response\.status === 204/);
  assert.match(source, /status:'queued-unverified'/);
  assert.match(source, /ACTIONS_DISPATCH_AMBIGUOUS/);
});

test('admin UI only submits approved workflow ID and never carries provider credentials', async () => {
  const source = await read('release-control-admin.js');
  assert.match(source, /api\/control\/secrets\/actions\/dispatch/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /github-workflow-dispatch/);
  assert.match(source, /body:JSON\.stringify\(\{ workflow:item\.id \}\)/);
  assert.match(source, /Cloudflare API Tokens 관리/);
  assert.match(source, /GitHub Actions Secret 등록/);
  assert.doesNotMatch(source, /GITHUB_ACTIONS_DISPATCH_TOKEN|CLOUDFLARE_TRAFFIC_ANALYTICS_TOKEN/);
});

test('allowed workflows exist and have workflow_dispatch without deployment mutation', async () => {
  const [diagnostic, traffic] = await Promise.all([
    read('.github/workflows/cloudflare-production-usage-diagnose.yml'),
    read('.github/workflows/traffic-intelligence-analytics.yml'),
  ]);
  assert.match(diagnostic, /workflow_dispatch:/);
  assert.match(traffic, /workflow_dispatch:/);
  assert.match(diagnostic, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(diagnostic, /wrangler.*deploy/);
});
