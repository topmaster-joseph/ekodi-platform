import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../energy/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../energy-worker.js',import.meta.url),'utf8');
const staging=readFileSync(new URL('../wrangler.energy-staging.toml',import.meta.url),'utf8');

test('Energy AI presents the complete energy management surface',()=>{
  for(const term of ['EKODI ENERGY AI','Solar','ESS','EV','AI Manager']) assert.match(html,new RegExp(term,'i'));
  assert.match(html,/샘플 데이터/);
});

test('staging cannot actuate real equipment',()=>{
  assert.match(staging,/TELEMETRY_ENABLED = "false"/);
  assert.match(staging,/CONTROL_ENABLED = "false"/);
  assert.match(staging,/TELEMETRY_MODE = "isolated-staging"/);
});

test('electrical safety boundaries are permanent and explicit',()=>{
  for(const action of ['breaker_off','protection_override','inverter_safety_change','safety_interlock_bypass']) assert.match(worker,new RegExp(action));
  assert.match(worker,/safety_boundary_permanent/);
  assert.doesNotMatch(worker,/fetch\(['"]https?:\/\//);
});

test('control policy requires observation before bounded automation',()=>{
  assert.match(worker,/observe-suggest-approve-bounded/);
  assert.match(worker,/human_approval_required/);
  assert.match(worker,/policy_allows_but_control_adapter_disabled/);
});
