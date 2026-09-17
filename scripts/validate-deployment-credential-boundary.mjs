import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(root, 'config', 'deployment-credential-boundary.json');
const sandboxWorkflowPath = path.join(root, '.github', 'workflows', 'ekodi-ai-orchestration-gate.yml');
const controllerWorkflowPath = path.join(root, '.github', 'workflows', 'deploy-cloudflare-secret-manager.yml');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [policyPath, sandboxWorkflowPath, controllerWorkflowPath]) {
  expect(fs.existsSync(file), `required credential-boundary file missing: ${path.relative(root, file)}`);
}

function workflowStep(source, name) {
  const marker = `- name: ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('\n      - name:', start + marker.length);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

if (failures.length === 0) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const sandboxWorkflow = fs.readFileSync(sandboxWorkflowPath, 'utf8');
  const controllerWorkflow = fs.readFileSync(controllerWorkflowPath, 'utf8');
  const sandboxStep = workflowStep(sandboxWorkflow, 'Enforce virtualized execution boundary');

  expect(policy.policyId === 'EXEC-CRED-001', 'credential boundary policy id mismatch');
  expect(policy.status === 'enforced', 'credential boundary must remain enforced');
  expect(policy.generation === 10, 'credential boundary must remain Generation 10');
  expect(policy.sandbox?.productionCredentials === 'forbidden', 'production credentials must remain forbidden in sandboxes');
  expect(policy.sandbox?.longLivedCredentials === 'forbidden', 'long-lived credentials must remain forbidden in sandboxes');
  expect(policy.sandbox?.credentialInjection === 'forbidden', 'credential injection must remain forbidden in sandboxes');
  expect(policy.sandbox?.providerMutation === 'forbidden', 'provider mutation must remain forbidden in sandboxes');
  expect(policy.releaseController?.directAgentCredentialAccess === false, 'agents may not directly access release credentials');
  expect(policy.releaseController?.productionMutationRequiresGuardedRelease === true, 'production mutation must require guarded release');
  expect(policy.releaseController?.cloudflare?.sandboxPropagation === 'forbidden', 'Cloudflare credential propagation into sandboxes must remain forbidden');

  expect(Boolean(sandboxStep), 'virtualized execution boundary step is missing');
  expect(sandboxStep.includes('EKODI_PRODUCTION_SECRET_SENTINEL: must-not-enter-sandbox'), 'sandbox step must define the host-only production-secret sentinel');
  expect(sandboxStep.includes('test -z "${EKODI_PRODUCTION_SECRET_SENTINEL:-}"'), 'sandbox step must prove the host-only sentinel was not forwarded');
  expect(!sandboxStep.includes('${{ secrets.'), 'sandbox step may not reference GitHub Actions secrets');
  expect(!/(CLOUDFLARE_API_TOKEN|CLOUDFLARE_SECRET_MANAGER_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|GH_TOKEN|GITHUB_TOKEN)/.test(sandboxStep), 'sandbox step may not name or consume privileged deployment credentials');

  const podmanStart = sandboxStep.indexOf('podman run');
  expect(podmanStart >= 0, 'sandbox boundary must execute through rootless Podman');
  if (podmanStart >= 0) {
    const podmanCommand = sandboxStep.slice(podmanStart);
    expect(!/(?:^|\s)(?:--env(?:-file)?|-e)(?:\s|=)/m.test(podmanCommand), 'sandbox Podman invocation may not inject environment credentials');
  }

  expect(controllerWorkflow.includes('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}'), 'release controller must source the Cloudflare deployment token from GitHub Actions secrets');
  expect(controllerWorkflow.includes('node scripts/guarded-worker-release.mjs'), 'release controller must mutate Cloudflare only through the guarded release path');
  expect(!controllerWorkflow.includes('podman run'), 'credential-bearing release controller workflow may not forward its environment into an execution sandbox');
}

if (failures.length) {
  console.error('[EKODI][EXEC-CRED-001] deployment credential boundary validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[EKODI][EXEC-CRED-001] deployment credential boundary validated.');
console.log('[EKODI][EXEC-CRED-001] production credentials remain outside autonomous execution sandboxes.');
console.log('[EKODI][EXEC-CRED-001] privileged provider mutation remains confined to the independent guarded release controller.');
