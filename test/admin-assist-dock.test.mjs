import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('EKODI Assist source parses and stays one fixed dock with two modes',async()=>{
  const [js,css]=await Promise.all([read('admin-assist-dock.js'),read('admin-assist-dock.css')]);
  const parsed=spawnSync(process.execPath,['--check',new URL('../admin-assist-dock.js',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
  assert.match(js,/id=\"ekodiAssistLauncher\"/);
  assert.match(js,/data-assist-tab=\"inbox\"/);
  assert.match(js,/data-assist-tab=\"ai\"/);
  assert.match(css,/\.ekodi-assist\{position:fixed/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/position:fixed;left:0;right:0;bottom:0/);
  assert.doesNotMatch(js,/setInterval\s*\(/);
  assert.doesNotMatch(js,/pointermove|dragstart|draggable/);
});

test('Assist combines canonical Operator and AI Mission Control without a second backend',async()=>{
  const js=await read('admin-assist-dock.js');
  assert.match(js,/\/api\/control\/messenger\/inbox/);
  assert.match(js,/\/api\/control\/messenger\/threads\//);
  assert.match(js,/\/api\/control\/ai\/actions/);
  assert.match(js,/awaiting_human/);
  assert.match(js,/item\.status==='waiting_human'/);
  assert.match(js,/actions\.filter\(item=>item\.status==='awaiting_human'\)/);
  assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|OPENAI_API_KEY/);
});

test('Assist is current-screen aware and high-impact actions map to permanent human gates',async()=>{
  const js=await read('admin-assist-dock.js');
  assert.match(js,/\.sidebar \.nav\.active\[data-section\]/);
  assert.match(js,/#pageTitle/);
  for(const area of [
    'legal_commitment_or_contract_execution',
    'high_value_or_exceptional_financial_commitment',
    'destructive_or_mass_data_change',
    'identity_merge_or_irreversible_privacy_change',
    'policy_change_that_materially_reduces_user_rights',
    'domain_service_shutdown_or_ownership_transfer',
  ]) assert.match(js,new RegExp(area));
  assert.match(js,/service\.health_check/);
  assert.match(js,/ui\.change_request/);
  assert.match(js,/preflightVerified/);
});

test('Assist first path is launcher-only and upgrades through existing secured lazy assets',async()=>{
  const [postbuild,shell,bootstrap,bootstrapCss]=await Promise.all([
    read('scripts/admin-thin-postbuild.mjs'),read('admin-authenticated-shell.js'),read('admin-assist-bootstrap.js'),read('admin-assist-bootstrap.css')
  ]);
  assert.match(postbuild,/admin-assist-bootstrap\.js/);
  assert.match(postbuild,/admin-assist-bootstrap\.css/);
  assert.match(postbuild,/admin-assist-dock\.js/);
  assert.match(postbuild,/admin-assist-dock\.css/);
  assert.match(postbuild,/admin-lazy-features\.js/);
  assert.match(postbuild,/ai-ops-admin\.css/);
  assert.match(postbuild,/Assist launcher-only first path/);
  assert.match(bootstrap,/requestIdleCallback/);
  assert.match(bootstrap,/loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/loadScript\('admin-lazy-features\.js'\)/);
  assert.match(bootstrapCss,/\.ekodi-assist-bootstrap/);
  assert.doesNotMatch(bootstrap,/\/api\/control\/messenger\/inbox/);
  assert.match(shell,/compact-control-center\.js/);
  assert.doesNotMatch(shell,/admin-assist-dock\.js/);
  assert.doesNotMatch(shell,/admin-assist-dock\.css/);
});

test('guarded shared-site release verifies bootstrap and full Assist lazy assets separately',async()=>{
  const manifest=await read('deploy/manifests/shared-site.worker.json');
  assert.match(manifest,/admin\.ekodi\.kr\/compact-control-center\.js\?assist=v2/);
  assert.match(manifest,/ekodiAssistBootstrap/);
  assert.match(manifest,/admin\.ekodi\.kr\/admin-lazy-features\.js\?assist=v2/);
  assert.match(manifest,/ekodiAssistDock/);
  assert.match(manifest,/api\\\/control\\\/messenger\\\/inbox/);
  assert.match(manifest,/api\\\/control\\\/ai\\\/actions/);
  assert.match(manifest,/admin\.ekodi\.kr\/ai-ops-admin\.css\?assist=v2/);
  assert.match(manifest,/ekodi-assist-launcher/);
});
