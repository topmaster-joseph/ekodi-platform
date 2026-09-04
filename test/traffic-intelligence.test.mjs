import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyTrafficUserAgent,
  isAllowedTelemetryOrigin,
  trafficSiteIdForHost,
} from '../traffic-intelligence.js';

test('EKODI automation is separated from public crawlers and unknown browsers', () => {
  assert.equal(classifyTrafficUserAgent('EKODI-Monitor/3.2').category, 'ekodi_internal');
  assert.equal(classifyTrafficUserAgent('EKODI-Bounded-Load-Test/1.0 (+https://ekodi.kr)').category, 'ekodi_internal');
  assert.equal(classifyTrafficUserAgent('Mozilla/5.0 compatible Googlebot/2.1').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('OAI-SearchBot/1.0').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('Claude-SearchBot/1.0').category, 'search_bot');
  assert.equal(classifyTrafficUserAgent('Go-http-client/1.1').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('curl/8.13.0').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('HeadlessChrome/151.0').category, 'other_bot');
  assert.equal(classifyTrafficUserAgent('Mozilla/5.0 Chrome/151.0 Safari/537.36').category, 'unclassified');
});

test('site mapping handles EKODI and legacy managed domains', () => {
  assert.equal(trafficSiteIdForHost('church.ekodi.kr'), 'church');
  assert.equal(trafficSiteIdForHost('ekodichurch.kr'), 'church');
  assert.equal(trafficSiteIdForHost('cgma.or.kr'), 'cgma');
  assert.equal(trafficSiteIdForHost('ekodi.kr'), 'root');
});
test('telemetry origin policy allows managed HTTPS surfaces only', () => {
  assert.equal(isAllowedTelemetryOrigin('https://church.ekodi.kr'), true);
  assert.equal(isAllowedTelemetryOrigin('https://ekodichurch.kr'), true);
  assert.equal(isAllowedTelemetryOrigin('http://church.ekodi.kr'), false);
  assert.equal(isAllowedTelemetryOrigin('https://evil.example'), false);
  assert.equal(isAllowedTelemetryOrigin('https://customer.example', 'https://customer.example'), true);
});

test('storage contract contains aggregates and daily hashes, not raw request identity', async () => {
  const migration = await readFile('migrations/0059_traffic_intelligence.sql', 'utf8');
  assert.match(migration, /traffic_intelligence_daily/);
  assert.match(migration, /traffic_human_sessions/);
  assert.match(migration, /session_hash/);
  assert.doesNotMatch(migration, /client_ip|request_path|raw_log|user_agent/i);

  const control = await readFile('traffic-intelligence-control.js', 'utf8');
  assert.doesNotMatch(control, /cf-connecting-ip|x-forwarded-for|headers\.get\(['"]user-agent/i);
  assert.match(control, /crypto\.subtle\.digest\('SHA-256'/);
});

test('browser beacon respects privacy signals and classifier collector is daily aggregate only', async () => {
  const shell = await readFile('shell/shell.js', 'utf8');
  assert.match(shell, /globalPrivacyControl/);
  assert.match(shell, /doNotTrack/);
  assert.match(shell, /api\/telemetry\/visit/);
  assert.match(shell, /sendBeacon/);

  const collector = await readFile('scripts/collect-traffic-intelligence.mjs', 'utf8');
  assert.match(collector, /86400000/);
  assert.match(collector, /httpRequestsAdaptiveGroups/);
  assert.doesNotMatch(collector, /client_ip|request_path|raw_log/i);
});