// EKODI Orchestrator — guarded, read-only production fleet canary.
// Reuses the existing short-lived official E2E super-admin session.
// It cannot create sessions, mutate D1, release, probe arbitrary hosts, or start AI.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ecosystem from '../config/ecosystem-services.json' with { type: 'json' };
import { projectLiveFleetRegistry } from '../ekodi-fleet-status.js';

const ORIGIN = 'https://ekodi.kr';
const API_PATH = '/api/control/ai/v8/fleet';
const MAX_RESPONSE_CHARS = 1024 * 1024;
const STATES = new Set(['healthy', 'partial', 'degraded', 'critical']);
function fail(code) { throw new Error(code); }
function responseHeader(response, key) {
  return String(response?.headers?.get(key) || '').toLowerCase();
}
async function boundedText(response) {
  if (Number(responseHeader(response, 'content-length')) > MAX_RESPONSE_CHARS)
    fail('fleet_response_too_large');
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) fail('fleet_response_too_large');
  return body;
}

export function validateLiveFleetSnapshot(payload, registry = ecosystem.services) {
  const fleet = payload?.fleet;
  if (payload?.ok !== true || !fleet || fleet.mutation !== false ||
      !Array.isArray(fleet.services) || !fleet.overall ||
      !fleet.overall.counts || !fleet.sources ||
      !fleet.blindSpots || !STATES.has(fleet.overall.health))
    fail('fleet_contract_invalid');
  const expected = projectLiveFleetRegistry(registry);
  if (expected.length === 0) fail('fleet_registry_empty');
  if (fleet.sources.registryServices !== expected.length ||
      fleet.overall.counts.total !== fleet.services.length)
    fail('fleet_registry_mismatch');
  const actual = new Map(fleet.services.map(item => [item?.id, item]));
  if (actual.size !== fleet.services.length ||
      expected.some(item => actual.get(item.id)?.inRegistry !== true))
    fail('fleet_registry_coverage_missing');
  const failures = fleet.sources.observationFailures;
  if (!Array.isArray(failures) || failures.length !== 0)
    fail('fleet_observation_source_unavailable');
  const counts = fleet.overall.counts;
  if (counts.offline > 0 && fleet.overall.health !== 'critical')
    fail('fleet_false_green_offline');
  if ((counts.stale > 0 || counts.unknown > 0 || counts.degraded > 0) &&
      fleet.overall.health === 'healthy')
    fail('fleet_false_green_unverified');
  if (!Array.isArray(fleet.blindSpots.unmonitored) ||
      fleet.blindSpots.unmonitoredCount !== fleet.blindSpots.unmonitored.length ||
      fleet.blindSpots.unmonitored.some(id => actual.get(id)?.monitored !== false))
    fail('fleet_blind_spots_invalid');
  return Object.freeze({
    ok: true, verifiedRegisteredServices: expected.length,
    observedHealth: fleet.overall.health,
    unmonitoredCount: fleet.blindSpots.unmonitoredCount,
    staleCount: counts.stale,
    productionMutationPerformed: false,
  });
}

export async function verifyProductionFleet({ token, fetchImpl = fetch } = {}) {
  // The E2E workflow creates hex-encoded 32-byte temporary auth sessions.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token))
    fail('fleet_canary_session_missing');
  const request = async (path, authenticated) => {
    const headers = authenticated
      ? { authorization: 'Bearer ' + token, accept: '*/*', 'cache-control': 'no-store' }
      : { accept: 'application/json', 'cache-control': 'no-store' };
    try {
      return await fetchImpl(ORIGIN + path, {
        method: 'GET', redirect: 'error', cache: 'no-store',
        headers, signal: AbortSignal.timeout(15_000),
      });
    } catch { fail('fleet_request_unavailable'); }
  };

  // Fail if guests are accidentally served the authenticated fleet model.
  const guest = await request(API_PATH, false);
  if (responseHeader(guest, 'content-type').includes('json')) {
    let publicData;
    try { publicData = JSON.parse(await boundedText(guest)); }
    catch { fail('fleet_guest_response_invalid'); }
    if (publicData?.fleet || publicData?.services || publicData?.ok === true)
      fail('fleet_guest_data_exposure');
  } else if (guest.status >= 200 && guest.status < 300) {
    fail('fleet_guest_unexpected_success');
  }

  const json = await request(API_PATH, true);
  if (!json.ok || !responseHeader(json, 'content-type').includes('json') ||
      !responseHeader(json, 'cache-control').includes('no-store'))
    fail('fleet_authenticated_json_unavailable');
  let data;
  try { data = JSON.parse(await boundedText(json)); }
  catch { fail('fleet_json_invalid'); }
  const report = validateLiveFleetSnapshot(data);

  const html = await request(API_PATH + '/view', true);
  if (!html.ok || !responseHeader(html, 'content-type').includes('text/html') ||
      !responseHeader(html, 'cache-control').includes('no-store') ||
      !responseHeader(html, 'content-security-policy').includes("default-src 'none'"))
    fail('fleet_authenticated_html_unavailable');
  const page = await boundedText(html);
  if (!page.includes('EKODI 함대 상태') || !page.includes('읽기 전용 통합 관제'))
    fail('fleet_html_contract_invalid');
  return report;
}

// Only a direct CLI invocation runs network checks. Imports stay pure/testable.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const report = await verifyProductionFleet({ token: process.env.E2E_ADMIN_TOKEN });
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch (error) {
    process.stderr.write('EKODI fleet canary: ' + (error?.message || 'unknown_error') + '\n');
    process.exitCode = 1;
  }
}
