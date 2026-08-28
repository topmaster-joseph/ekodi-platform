import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../energy/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../energy/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../energy-worker.js',import.meta.url),'utf8');
const staging=readFileSync(new URL('../wrangler.energy-staging.toml',import.meta.url),'utf8');

test('Energy AI presents the complete energy management surface',()=>{
  for(const term of ['ENERGY AI','Solar','ESS','EV','AI Manager']) assert.match(html,new RegExp(term,'i'));
  assert.match(html,/샘플 데이터/);
});

test('Energy AI expands from household monitoring into a distributed energy platform',()=>{
  for(const term of ['AI DISTRIBUTED ENERGY PLATFORM','개인 무료 Energy Check','사업장 Energy AI','설치·관리업체 Fleet','LOCAL ENERGY NETWORK','REVENUE LOOP']) assert.match(app,new RegExp(term,'i'));
  assert.match(app,/본인인증과 주소만 받습니다/);
  assert.match(app,/실제 데이터는 인증된 사용자/);
  assert.match(app,/DEMO · 실제 고객 데이터 아님/);
  assert.match(app,/10~30개 실제 사이트로 먼저 검증/);
});

test('consumer connection starts with central auth and does not imply address-only data access',()=>{
  assert.match(app,/https:\/\/auth\.ekodi\.kr\//);
  assert.match(app,/target\.searchParams\.set\('site','energy'\)/);
  assert.match(app,/주소만으로 타인의 전력 데이터를 조회하지 않습니다/);
  assert.match(app,/고객 동의·계약 확인 후 읽기/);
});

test('Energy workspace switcher consumes one-time handoff and revalidates person workspace',()=>{
  assert.match(html,/id="workspaceSwitch"/);
  assert.match(app,/functions\/v1\/workspace-api/);
  assert.match(app,/\$\{WORKSPACE_API\}\/workspaces\?site=energy/);
  assert.match(app,/verifyOtp\(\{token_hash:token/);
  assert.match(app,/ekodi_workspace/);
  assert.match(app,/workspace_key===key/);
  assert.match(app,/my\.ekodi\.kr/);
  assert.match(app,/return_to/);
  assert.match(worker,/script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(worker,/connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co/);
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

test('Pizzamaru Mokpo is pilot 01 with bill-first and selective-sensor strategy',()=>{
  const pilot=readFileSync(new URL('../energy/pizzamaru-pilot.js',import.meta.url),'utf8');
  for(const term of ['피자마루 목포대점','pizzamaru-mokpo-01','고지서','AMI','CT 센서','초과비용 후보']) assert.match(pilot,new RegExp(term,'i'));
  assert.match(pilot,/무센서 우선/);
  assert.match(pilot,/필요할 때만/);
  assert.match(worker,/buildBillInsight/);
  assert.match(worker,/api\/pilot\/pizzamaru-mokpo-01/);
  assert.match(worker,/api\/energy\/v1\/pilots\/pizzamaru-mokpo-01/);
  assert.match(worker,/url\.pathname==='\/pizzamaru'/);
});

test('Energy v1 connector contract keeps data sources modular and non-live by default',()=>{
  for(const connector of ['bill-manual','google-drive-bill','gmail-bill','korea-ami','ct-sensor']) assert.match(worker,new RegExp(connector));
  assert.match(worker,/adapter_contract_ready/);
  assert.match(worker,/connection_required/);
  assert.match(worker,/optional_phase2/);
  assert.match(worker,/controlEnabled:false/);
});
