import test from 'node:test';
import assert from 'node:assert/strict';
import ecosystem from '../config/ecosystem-services.json' with { type: 'json' };
import { buildFleetStatus, projectLiveFleetRegistry } from '../ekodi-fleet-status.js';
import { validateLiveFleetSnapshot, verifyProductionFleet } from '../scripts/verify-ekodi-fleet-live.mjs';
import { readFile } from 'node:fs/promises';

const token = 'a'.repeat(64);
const now = '2026-10-30T12:00:00.000Z';
const live = projectLiveFleetRegistry(ecosystem.services);
const model = () => buildFleetStatus({ now, registryServices: live });
const payload = () => ({ ok: true, fleet: structuredClone(model()) });
const jsonResponse = body => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const htmlResponse = ({ csp = true } = {}) => new Response(
  '<html><title>EKODI 함대 상태</title>읽기 전용 통합 관제</html>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...(csp ? { 'content-security-policy': "default-src 'none'" } : {}),
    },
  },
);
function fakeFetch({ guest = {authenticated:false}, json = payload(), html = htmlResponse() } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    if (!options.headers.authorization) return jsonResponse(guest);
    return url.endsWith('/view') ? html : jsonResponse(json);
  };
  return {calls, fetchImpl};
}

test('truthful live registry blind spots yield safe partial fleet proof', () => {
  assert.ok(live.length > 0);
  const result = validateLiveFleetSnapshot(payload());
  assert.equal(result.ok, true);
  assert.equal(result.verifiedRegisteredServices, live.length);
  assert.equal(result.observedHealth, 'partial');
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.unmonitoredCount, live.length);
});

test('canonical live service omission is never a successful fleet canary', () => {
  const p = payload();
  p.fleet.services = p.fleet.services.filter(s => s.id !== live[0].id);
  p.fleet.overall.counts.total = p.fleet.services.length;
  assert.throws(() => validateLiveFleetSnapshot(p), /fleet_registry_coverage_missing/);
});

test('healthy status with unknown or stale evidence is rejected', () => {
  for (const change of ['unknown', 'stale']) {
    const p = payload();
    p.fleet.overall.health = 'healthy';
    p.fleet.overall.counts[change] = 1;
    assert.throws(() => validateLiveFleetSnapshot(p), /fleet_false_green_unverified/);
  }
});

test('missing D1 source, incorrect registry size and mutation mode all fail closed', () => {
  const a = payload();
  a.fleet.sources.observationFailures = ['service_check_latest'];
  assert.throws(() => validateLiveFleetSnapshot(a), /fleet_observation_source_unavailable/);
  const b = payload();
  b.fleet.sources.registryServices = 0;
  assert.throws(() => validateLiveFleetSnapshot(b), /fleet_registry_mismatch/);
  const c = payload();
  c.fleet.mutation = true;
  assert.throws(() => validateLiveFleetSnapshot(c), /fleet_contract_invalid/);
});

test('authenticated GETs stay on canonical host and guest never receives token', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const r = await verifyProductionFleet({ token, fetchImpl });
  assert.equal(r.verifiedRegisteredServices, live.length);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.url.startsWith('https://ekodi.kr/api/control/ai/v8/fleet')));
  assert.ok(calls.every(c => c.options.method === 'GET' && c.options.redirect === 'error'));
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[1].options.headers.authorization, 'Bearer ' + token);
  assert.equal(calls[2].options.headers.authorization, 'Bearer ' + token);
  assert.equal(JSON.stringify(r).includes(token), false);
});

test('guest fleet exposure, missing session, missing CSP all cause failure', async () => {
  const exposed = fakeFetch({ guest: payload() });
  await assert.rejects(verifyProductionFleet({token, fetchImpl:exposed.fetchImpl}), /fleet_guest_data_exposure/);
  await assert.rejects(verifyProductionFleet({token:'forged', fetchImpl:exposed.fetchImpl}), /fleet_canary_session_missing/);
  const noCsp = fakeFetch({ html:htmlResponse({csp:false}) });
  await assert.rejects(verifyProductionFleet({token, fetchImpl:noCsp.fetchImpl}), /fleet_authenticated_html_unavailable/);
});

test('network failure is sanitized and cannot disclose a token', async () => {
  await assert.rejects(
    verifyProductionFleet({token, fetchImpl:async () => {throw new Error('sensitive network payload');}}),
    error => error.message === 'fleet_request_unavailable' && !error.message.includes('sensitive'),
  );
});

test('native existing workflow integrates the canary after genuine admin session and before task mutation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-orchestrator-live-e2e.yml', import.meta.url), 'utf8');
  const session = workflow.indexOf('name: Issue short-lived genuine production admin session');
  const canary = workflow.indexOf('name: Verify authenticated fleet read-model and guest boundary');
  const pulse = workflow.indexOf('name: Submit and execute read-only orchestration proof');
  assert.ok(session >= 0 && session < canary && canary < pulse);
  assert.match(workflow, /node scripts\/verify-ekodi-fleet-live\.mjs/);
  const expectedCondition = "if: steps.budget.outputs.allowed == 'true' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'";
  const sessionBlock = workflow.slice(session, canary);
  const fleetBlock = workflow.slice(canary, pulse);
  assert.ok(sessionBlock.includes(expectedCondition));
  assert.ok(fleetBlock.includes(expectedCondition));
  assert.match(fleetBlock, /node scripts\/verify-ekodi-fleet-live\.mjs/);
  const providerBlock = workflow.slice(pulse, workflow.indexOf('name: Poll authoritative command state to terminal'));
  assert.match(providerBlock, /if: steps\.budget\.outputs\.allowed == 'true'/);
  assert.doesNotMatch(providerBlock, /github\.event_name/);
  assert.match(workflow, /if: always\(\) && env\.E2E_AUTH_DB_ID != '' && env\.E2E_TOKEN_HASH != ''/);
});

test('scheduled read-only proof remains available when the paid AI proof is already budget-gated', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-ekodi-orchestrator-live-e2e.yml', import.meta.url), 'utf8');
  const block = (name, next) => workflow.slice(workflow.indexOf('name: ' + name), workflow.indexOf('name: ' + next));
  const sessionBlock = block('Issue short-lived genuine production admin session', 'Verify authenticated fleet read-model and guest boundary');
  const fleetBlock = block('Verify authenticated fleet read-model and guest boundary', 'Submit and execute read-only orchestration proof');
  const paidBlock = block('Submit and execute read-only orchestration proof', 'Poll authoritative command state to terminal');
  const schedule = { budgetAllowed: false, eventName: 'schedule' };
  const manual = { budgetAllowed: false, eventName: 'workflow_dispatch' };
  const push = { budgetAllowed: false, eventName: 'push' };
  const canRunFleet = input => input.budgetAllowed || input.eventName === 'schedule' || input.eventName === 'workflow_dispatch';
  for (const input of [schedule, manual]) {
    assert.equal(canRunFleet(input), true);
    assert.match(sessionBlock, /github\.event_name == 'schedule'/);
    assert.match(fleetBlock, /github\.event_name == 'workflow_dispatch'/);
    assert.match(paidBlock, /if: steps\.budget\.outputs\.allowed == 'true'/);
  }
  assert.equal(canRunFleet(push), false, 'quota-gated push cannot mint synthetic sessions in bulk');
});
