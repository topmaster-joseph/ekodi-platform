import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFleetStatus, projectLiveFleetRegistry, renderFleetStatusHtml, EKODI_FLEET_STATUS } from '../ekodi-fleet-status.js';
import ecosystemServices from '../config/ecosystem-services.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';

const NOW = '2026-10-21T00:00:00.000Z';
const fresh = '2026-10-21T00:00:00.000Z';
const old = '2026-10-20T00:00:00.000Z'; // 24h old → stale under 2h threshold

test('empty input remains frozen but cannot report a healthy fleet without evidence', () => {
  const m = buildFleetStatus({ now: NOW });
  assert.equal(m.mutation, false);
  assert.equal(m.overall.health, 'partial');
  assert.equal(m.overall.counts.total, 0);
  assert.equal(m.overall.label, '부분 관측');
  assert.equal(Object.isFrozen(m), true);
  assert.equal(Object.isFrozen(m.services), true);
});

test('canonical registry projects only distinct production-verified live services', () => {
  const visible = projectLiveFleetRegistry([
    { id: 'church', name: 'Church', url: 'https://ekodi.kr/ekodichurch', status: 'live', productionVerified: true },
    { id: 'church', name: 'Duplicate', status: 'live', productionVerified: true },
    { id: 'preparing', status: 'preparing', productionVerified: true },
    { id: 'beta', status: 'beta', productionVerified: true },
    { id: 'unverified', status: 'live', productionVerified: false },
    { id: '', status: 'live', productionVerified: true },
  ]);
  assert.deepEqual(visible, [{
    id: 'church', name: 'Church', url: 'https://ekodi.kr/ekodichurch', status: 'live',
  }]);
});

test('registered live service without monitoring appears as a blind spot', () => {
  const visible = projectLiveFleetRegistry([
    { id: 'church', name: 'Church', status: 'live', productionVerified: true },
    { id: 'mall', name: 'Mall', status: 'live', productionVerified: true },
    { id: 'planned', status: 'preparing', productionVerified: false },
  ]);
  const model = buildFleetStatus({
    now: NOW, registryServices: visible,
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: fresh }],
  });
  assert.deepEqual(model.blindSpots.unmonitored, ['mall']);
  assert.equal(model.overall.health, 'partial');
  assert.equal(model.overall.counts.total, 2);
  assert.equal(model.services.some(x => x.id === 'planned'), false);
});

test('protected fleet route uses actual canonical service registry', async () => {
  const source = await readFile(new URL('../ai-command-control.js', import.meta.url), 'utf8');
  assert.match(source, /import ecosystemServices from '\.\/config\/ecosystem-services\.json' with/);
  assert.match(source, /registryServices: projectLiveFleetRegistry\(ecosystemServices\.services\)/);
  const live = projectLiveFleetRegistry(ecosystemServices.services);
  assert.ok(live.some(x => x.id === 'church'));
  assert.ok(live.every(x => x.status === 'live'));
  assert.ok(live.every(x => x.id && x.name));
});

test('online latest checks roll up to healthy', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [
      { service_id: 'church', status: 'online', http_status: 200, response_ms: 42, checked_at: fresh },
      { service_id: 'mall', status: 'ok', http_status: 200, response_ms: 80, checked_at: fresh },
    ],
  });
  assert.equal(m.overall.health, 'healthy');
  assert.equal(m.overall.counts.online, 2);
  assert.equal(m.services.length, 2);
  assert.equal(m.services.every(s => s.monitored), true);
});

test('an offline service makes the whole fleet critical', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [
      { service_id: 'church', status: 'online', checked_at: fresh },
      { service_id: 'pay', status: 'down', http_status: 503, checked_at: fresh },
    ],
  });
  assert.equal(m.overall.health, 'critical');
  assert.equal(m.overall.counts.offline, 1);
  // worst-first ordering puts the offline service first
  assert.equal(m.services[0].id, 'pay');
  assert.equal(m.services[0].worstStatus, 'offline');
});

test('a degraded service makes the fleet degraded', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'books', status: 'degraded', checked_at: fresh }],
  });
  assert.equal(m.overall.health, 'degraded');
  assert.equal(m.overall.counts.degraded, 1);
});

test('stale checks are flagged and degrade the fleet', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: old }],
  });
  assert.equal(m.services[0].stale, true);
  assert.equal(m.overall.counts.stale, 1);
  assert.equal(m.overall.health, 'degraded');
});

test('missing, malformed and implausibly future-dated timestamps cannot prove green health', () => {
  for (const checked_at of [undefined, '', 'not-a-date', '2026-10-22T00:00:00Z']) {
    const m = buildFleetStatus({
      now: NOW,
      latestChecks: [{ service_id: 'church', status: 'online', checked_at }],
    });
    assert.equal(m.services[0].stale, true, String(checked_at));
    assert.equal(m.overall.health, 'degraded', String(checked_at));
    assert.equal(m.overall.counts.stale, 1, String(checked_at));
  }
});

test('partial or failed D1 source reads never claim whole fleet green', () => {
  const oneReadFailed = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: fresh }],
    observationFailures: ['cloudflare_environment_checks'],
  });
  assert.equal(oneReadFailed.overall.health, 'partial');
  assert.deepEqual(oneReadFailed.sources.observationFailures, ['cloudflare_environment_checks']);
  assert.match(renderFleetStatusHtml(oneReadFailed), /관측 자료 일부 조회 실패/);

  const bothReadsFailed = buildFleetStatus({
    now: NOW,
    observationFailures: ['service_check_latest', 'cloudflare_environment_checks'],
  });
  assert.equal(bothReadsFailed.overall.health, 'partial');
  assert.equal(bothReadsFailed.overall.counts.total, 0);

  const failureStillWins = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'pay', status: 'down', checked_at: fresh }],
    observationFailures: ['cloudflare_environment_checks'],
  });
  assert.equal(failureStillWins.overall.health, 'critical');
});

test('small future clock skew remains fresh and existing failure signals stay critical', () => {
  const withinSkew = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: '2026-10-21T00:00:30Z' }],
  });
  assert.equal(withinSkew.overall.health, 'healthy');
  const failure = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'church', status: 'offline' }],
  });
  assert.equal(failure.overall.health, 'critical');
  assert.equal(failure.services[0].stale, true);
});

test('empty fleet HTML must not display a healthy summary', () => {
  const html = renderFleetStatusHtml(buildFleetStatus({ now: NOW }));
  assert.match(html, /부분 관측/);
  assert.doesNotMatch(html, /<div class="h">정상<\/div>/);
});

test('registry service with no health signal is an unmonitored blind spot', () => {
  const m = buildFleetStatus({
    now: NOW,
    registryServices: [
      { id: 'church', name: 'EKODI Church', status: 'live' },
      { id: 'ghost', name: 'Uninstrumented', status: 'live' },
    ],
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: fresh }],
  });
  assert.deepEqual(m.blindSpots.unmonitored, ['ghost']);
  assert.equal(m.blindSpots.unmonitoredCount, 1);
  const ghost = m.services.find(s => s.id === 'ghost');
  assert.equal(ghost.monitored, false);
  assert.equal(ghost.worstStatus, 'unknown');
  assert.equal(m.overall.health, 'partial');
});

test('health row with no registry entry is an uncatalogued blind spot', () => {
  const m = buildFleetStatus({
    now: NOW,
    registryServices: [{ id: 'church', name: 'EKODI Church', status: 'live' }],
    latestChecks: [
      { service_id: 'church', status: 'online', checked_at: fresh },
      { service_id: 'shy-thunder-39a4', status: 'online', checked_at: fresh },
    ],
  });
  assert.deepEqual(m.blindSpots.uncatalogued, ['shy-thunder-39a4']);
  assert.equal(m.blindSpots.uncataloguedCount, 1);
});

test('environment checks roll to the worst status and normalize aliases', () => {
  const m = buildFleetStatus({
    now: NOW,
    environmentChecks: [
      { environment: 'production', service_id: 'mall', service_name: 'Mall', host: 'ekodi.kr', status: 'up', checked_at: fresh },
      { environment: 'staging', service_id: 'mall', service_name: 'Mall', host: 'stg', status: 'degraded', checked_at: fresh },
    ],
  });
  const mall = m.services.find(s => s.id === 'mall');
  assert.equal(mall.name, 'Mall');
  assert.equal(mall.environments.length, 2);
  assert.equal(mall.worstStatus, 'degraded');
});

test('twin drift degrades an otherwise-healthy fleet and passes through summary', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: 'church', status: 'online', checked_at: fresh }],
    twin: { health: 'drift', summary: { driftNodes: 2 }, generatedAt: fresh },
  });
  assert.equal(m.overall.health, 'degraded');
  assert.equal(m.twin.health, 'drift');
  assert.equal(m.twin.summary.driftNodes, 2);
});

test('renderFleetStatusHtml returns self-contained HTML and escapes untrusted text', () => {
  const m = buildFleetStatus({
    now: NOW,
    latestChecks: [{ service_id: '<x>&"', status: 'online', detail: '<script>', checked_at: fresh }],
  });
  const html = renderFleetStatusHtml(m);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /EKODI 함대 상태/);
  assert.ok(!html.includes('<script>'), 'raw <script> must be escaped out');
  assert.match(html, /&lt;x&gt;/);
  assert.match(html, new RegExp(EKODI_FLEET_STATUS.moduleId));
});

test('renderFleetStatusHtml tolerates a bad/empty model argument', () => {
  const html = renderFleetStatusHtml(null);
  assert.match(html, /^<!DOCTYPE html>/);
});
