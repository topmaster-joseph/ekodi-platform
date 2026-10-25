import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveGrowthOs, GROWTH_OS_PILLARS, GROWTH_OS_VERSION } from '../ekodi-growth-os.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const subject = { type: 'tenant', key: 'tenant-alpha' };

test('Growth OS contract is a six-pillar, read-only per-subject snapshot', () => {
  const result = deriveGrowthOs({ subject, at:'2026-10-25T00:00:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.version, GROWTH_OS_VERSION);
  assert.deepEqual(result.capabilities, GROWTH_OS_PILLARS);
  assert.deepEqual(result.subject, subject);
  assert.equal(result.execution.mode, 'read_only');
  assert.equal(result.execution.changesExecuted, 0);
  assert.equal(result.pillars.governance.paidActivation, false);
  assert.equal(result.pillars.governance.autonomousExternalPublishing, false);
  assert.equal(result.pillars.discovery.status, 'telemetry_not_connected');
  assert.equal(result.pillars.relationship.status, 'crm_not_connected');
  assert.equal(result.pillars.commerce.performance, null, 'unconnected commerce must not report zero sales');
  assert.equal(result.dataQuality.allSitesIntegrated, false);
});

test('Campaign and channel aggregates distinguish active, failed and awaiting approval without secrets', () => {
  const result = deriveGrowthOs({
    subject, campaigns:{total:5,active:2,awaiting_approval:1,failed:1,organic:4,paid:1},
    connections:[
      {provider:'facebook',status:'active',total:2},
      {provider:'youtube',status:'expired',total:1},
    ],
    catalog:[{id:'facebook',label:'Facebook',state:'ready',automaticPublishing:true,automationAdapter:true}],
  });
  assert.equal(result.campaigns.total, 5);
  assert.equal(result.campaigns.active, 2);
  assert.equal(result.campaigns.awaitingApproval, 1);
  assert.equal(result.channels.activeConnections, 2);
  assert.equal(result.channels.degradedConnections, 1);
  assert.deepEqual(result.nextActions.map(row => row.id).slice(0,3),
    ['repair_connections','review_campaigns','inspect_failures']);
  assert.equal(JSON.stringify(result).includes('token_ciphertext'), false);
  assert.equal(JSON.stringify(result).includes('external_id'), false);
});

test('Mall observations are explicitly sourced and never turned into causal AI marketing revenue', () => {
  const result = deriveGrowthOs({
    subject:{ type:'tenant', key:'ekodimall' },
    mall:{ok:true,schemaReady:true,performance30d:{
      reportReady:true,latestMetricDate:'2026-10-24',orders:8,observedCommissionKrw:12000,
      campaignVisits:40,outboundAffiliateClicks:10,
    }},
  });
  assert.equal(result.pillars.commerce.status, 'observed_mall_metrics');
  assert.equal(result.pillars.commerce.performance.observedCommission30dKrw, 12000);
  assert.equal(result.pillars.intelligence.status, 'observed_data');
  assert.match(result.pillars.commerce.performance.attribution, /No causal attribution/);
});

test('Marketing Growth API is behind existing subject auth and uses no public bypass', () => {
  const worker = read('marketing-growth-worker.js');
  const route = worker.indexOf("url.pathname === '/v1/growth-os/overview'");
  const auth = worker.indexOf('const auth = await authSubject(request,env,write);');
  assert.ok(auth > 0 && route > auth, 'new route must follow existing authSubject');
  assert.match(worker.slice(route,route+600), /growthOsSnapshot\(env, subject/);
  assert.doesNotMatch(worker.slice(route,route+600), /runMallAutonomousProfitLoop|publishFromVault|preparePaidPromotion/);
});

test('Existing MarketingAI console exposes a Growth OS tab and canonical routed API', () => {
  const ui = read('marketing-ai-admin.js');
  assert.match(ui, /\['growth-os','Growth OS'\]/);
  assert.match(ui, /marketing-connect-api\/v1\/growth-os\/overview\?subject_type=tenant/);
  assert.match(ui, /encodeURIComponent\(key\)/);
  assert.match(ui, /else if \(state.tab === 'growth-os'\) renderGrowthOs\(data\)/);
  assert.match(ui, /current\.pillars/);
});
