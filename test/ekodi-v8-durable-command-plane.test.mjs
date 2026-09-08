import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getEkodiProviderOperationalReadiness, getEkodiProviderReadiness } from '../ekodi-pulse-runtime.js';

test('multi-provider readiness is enabled without exposing credentials', () => {
  const status = getEkodiProviderReadiness({
    AI_MULTI_PROVIDER_ENABLED: 'true',
    OPENAI_API_KEY: 'openai-secret-test',
    ANTHROPIC_API_KEY: 'anthropic-secret-test',
    GEMINI_API_KEY: 'gemini-secret-test',
  });
  assert.equal(status.configuredCount, 3);
  assert.equal(status.collaborationReady, true);
  assert.equal(status.independentSentinelReady, true);
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('openai-secret-test'), false);
  assert.equal(serialized.includes('anthropic-secret-test'), false);
  assert.equal(serialized.includes('gemini-secret-test'), false);
});

test('provider keys alone do not bypass the explicit multi-provider gate', () => {
  const status = getEkodiProviderReadiness({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' });
  assert.equal(status.multiProviderEnabled, false);
  assert.equal(status.collaborationReady, false);
});

test('durable command ledger migration contains pulse task run and due indexes', () => {
  const migration = fs.readFileSync(new URL('../migrations/0069_ekodi_v8_command_ledger.sql', import.meta.url), 'utf8');
  for (const table of ['ai_pulse_events', 'ai_command_tasks', 'ai_command_runs']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /idx_ai_command_tasks_due/);
  assert.match(migration, /pulse_event_id TEXT UNIQUE/);
});

test('mission control wires v8 API and scheduled Pulse drain', () => {
  const worker = fs.readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /handleEkodiV8CommandControl/);
  assert.match(worker, /runEkodiPulseSchedule/);
  assert.match(worker, /ctx\.waitUntil\(commandPulse\)/);
});

test('production config opts into guarded multi-provider pooling', () => {
  const config = fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
  assert.match(config, /AI_MULTI_PROVIDER_ENABLED = "true"/);
  assert.doesNotMatch(config, /OPENAI_API_KEY\s*=/);
  assert.doesNotMatch(config, /ANTHROPIC_API_KEY\s*=/);
  assert.doesNotMatch(config, /GEMINI_API_KEY\s*=/);
});

test('operational readiness does not treat configured but unhealthy providers as ready', async () => {
  const rows = [
    { provider_id:'openai', enabled:1, health_status:'error', last_checked_at:'2026-09-08T01:00:00Z', last_error:'openai_429' },
    { provider_id:'anthropic', enabled:1, health_status:'healthy', last_checked_at:'2026-09-08T01:00:00Z', last_error:'' },
    { provider_id:'gemini', enabled:1, health_status:'healthy', last_checked_at:'2026-09-08T01:00:00Z', last_error:'' },
  ];
  const DB={prepare(){return{async all(){return{results:rows}}}}};
  const status=await getEkodiProviderOperationalReadiness({DB,AI_MULTI_PROVIDER_ENABLED:'true',OPENAI_API_KEY:'x',ANTHROPIC_API_KEY:'y',GEMINI_API_KEY:'z'});
  assert.equal(status.configuredCount,3);
  assert.equal(status.operationalCount,2);
  assert.equal(status.collaborationConfigured,true);
  assert.equal(status.collaborationReady,true);
  assert.equal(status.independentSentinelConfigured,true);
  assert.equal(status.independentSentinelReady,false);
  assert.equal(status.providers.find(provider=>provider.id==='openai').operational,false);
});


test('Control production release continuously verifies the protected v8 route and labels configured providers accurately', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8');
  assert.match(workflow, /api\/control\/ai\/v8\/status/);
  assert.match(workflow, /https:\/\/ekodi\.kr\/mcp/);
  assert.match(workflow, /ekodi_delegate_command/);
  assert.match(workflow, /ai\.command\.delegate/);
  assert.match(workflow, /mcp\/www_authenticate/);
  assert.match(workflow, /AI configured=\$\{AI_PROVIDER_READY_COUNT:-0\}/);
  assert.doesNotMatch(workflow, /AI providers=\$\{AI_PROVIDER_READY_COUNT:-0\}/);
  assert.match(workflow, /Runtime health is reported separately/);
});

test('collaboration settings enforce read and operate capabilities server-side', () => {
  const source = fs.readFileSync(new URL('../ai-command-control.js', import.meta.url), 'utf8');
  assert.match(source, /adminAuthorityForRole, hasEkodiCapability/);
  assert.match(source, /requiredCapability = writeAction \? 'ai:operate' : 'ai:read'/);
  assert.match(source, /error: 'capability_required', capability: requiredCapability/);
  assert.match(source, /sessionCapabilityGranted\(session, requiredCapability\)/);
});
