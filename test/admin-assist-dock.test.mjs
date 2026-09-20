import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('EKODI Assist source parses and stays one fixed dock with two modes',async()=>{
  const [js,css]=await Promise.all([read('admin-assist-dock.js'),read('admin-assist-dock.css')]);
  const parsed=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../admin-assist-dock.js',import.meta.url))],{encoding:'utf8'});
  assert.equal(parsed.status,0,parsed.stderr);
  assert.match(js,/id=\"ekodiAssistLauncher\"/);
  assert.match(js,/data-assist-tab=\"inbox\"/);
  assert.match(js,/data-assist-tab=\"ai\"/);
  assert.match(css,/\.ekodi-assist\{position:fixed/);
  assert.match(css,/height:min\(500px,60vh\)/);
  assert.match(css,/height:min\(58vh,540px\)/);
  assert.match(css,/max-height:calc\(100vh - 132px\)/);
  assert.doesNotMatch(css,/height:min\(680px,calc\(100vh - 92px\)\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/position:fixed;left:0;right:0;bottom:0/);
  assert.doesNotMatch(js,/setInterval\s*\(/);
  assert.doesNotMatch(js,/pointermove|dragstart|draggable/);
});

test('Assist combines canonical Operator, Mission Control and server-side Admin AI without browser secrets',async()=>{
  const js=await read('admin-assist-dock.js');
  assert.match(js,/\/api\/control\/messenger\/inbox/);
  assert.match(js,/\/api\/control\/messenger\/threads\//);
  assert.match(js,/\/api\/control\/ai\/actions/);
  assert.match(js,/\/api\/control\/ai\/assist/);
  assert.match(js,/awaiting_human/);
  assert.match(js,/item\.status==='waiting_human'/);
  assert.match(js,/actions\.filter\(item=>item\.status==='awaiting_human'\)/);
  assert.match(js,/aiHistory/);
  assert.match(js,/lastAiReply/);
  assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|OPENAI_API_KEY|sk-proj-/);
});

test('Assist is current-screen aware, action-first and high-impact actions map to permanent human gates',async()=>{
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
  assert.match(js,/ACTION_RE/);
  assert.match(js,/preflightVerified/);
  assert.match(js,/운영 큐에 기록하고 Admin AI가 응답했습니다/);
});

test('Assist first path is bottom command-entry-only and upgrades through existing secured lazy assets',async()=>{
  const [postbuild,shell,bootstrap,bootstrapCss]=await Promise.all([
    read('scripts/admin-thin-postbuild.mjs'),read('admin-authenticated-shell.js'),read('admin-assist-bootstrap.js'),read('admin-assist-bootstrap.css')
  ]);
  assert.match(postbuild,/admin-assist-bootstrap\.js/);
  assert.match(postbuild,/admin-assist-bootstrap\.css/);
  assert.match(postbuild,/admin-assist-dock\.js/);
  assert.match(postbuild,/admin-assist-dock\.css/);
  assert.match(postbuild,/admin-lazy-features\.js/);
  assert.match(postbuild,/ai-ops-admin\.css/);
  assert.match(postbuild,/bottom Assist command dock \+ lazy recent-command workbench verified/);
  assert.doesNotMatch(bootstrap,/requestIdleCallback/);
  assert.match(bootstrap,/ekodi-assist-bootstrap-form/);
  assert.match(bootstrap,/에코디에게 말해보세요/);
  assert.match(bootstrap,/ekodi-admin-assist-request/);
  assert.match(bootstrap,/loadStyle\('ai-ops-admin\.css'\)/);
  assert.match(bootstrap,/loadScript\('admin-lazy-features\.js'\)/);
  assert.match(bootstrap,/ekodi-admin-section-changed',S/);
  assert.match(bootstrap,/admin-command-home/);
  assert.match(bootstrapCss,/\.ekodi-assist-bootstrap/);
  assert.match(bootstrapCss,/left:var\(--ekodi-assist-left,260px\)/);
  assert.match(bootstrapCss,/bottom:0/);
  assert.match(bootstrapCss,/\.content\{padding-bottom:calc\(120px/);
  assert.doesNotMatch(bootstrapCss,/top:50%/);
  assert.doesNotMatch(bootstrap,/\/api\/control\/messenger\/inbox/);
  assert.match(shell,/admin-compact\.js/);
  assert.doesNotMatch(shell,/admin-assist-dock\.js/);
  assert.doesNotMatch(shell,/admin-assist-dock\.css/);
});

test('guarded shared-site release verifies bootstrap and full Assist lazy assets post-promotion',async()=>{
  const manifestText=await read('deploy/manifests/shared-site.worker.json');
  const manifest=JSON.parse(manifestText);
  const urls=[
    'admin-compact.js?assist=v2',
    'admin-compact.css?assist=v2',
    'admin-lazy-features.js?assist=v2',
    'ai-ops-admin.css?assist=v2',
  ].map(asset=>`https://ekodi.kr/admin/${asset}`);
  for(const url of urls){
    const request=manifest.worker.requests.find(item=>item.url===url);
    assert.ok(request,`missing guarded-release Assist asset: ${url}`);
    assert.equal(request.candidateVerify,false);
    assert.match(request.candidateVerifyReason||'',/post-promotion|after promotion/i);
    assert.ok(request.headerExpect?.includes('x-content-type-options: nosniff'));
  }
  assert.match(manifestText,/ekodiAssistBootstrap/);
  assert.match(manifestText,/ekodi-chief-ai-chat-v1/);
  assert.match(manifestText,/DECISION_RULES/);
  assert.match(manifestText,/ekodi-assist-launcher/);
  assert.match(manifestText,/ekodi-assist-panel/);
});


test('command history is global across admin menus while current screen context keeps updating', async()=>{
  const [js,css,bootstrap]=await Promise.all([read('admin-assist-dock.js'),read('admin-assist-dock.css'),read('admin-assist-bootstrap.js')]);
  assert.doesNotMatch(js,/selectSessionForCurrentSection/);
  assert.doesNotMatch(js,/sessions\.filter\(session=>session\.context\?\.section===section\)/);
  assert.match(js,/railTitle\.textContent='공통 대화 이력'/);
  assert.match(js,/placeholder='전체 대화 검색'/);
  assert.match(js,/classList\.add\('admin-command-history-ready'\)/);
  assert.match(js,/classList\.toggle\('history-only',!state\.open\)/);
  assert.match(css,/body\.admin-command-history-ready:not\(\.admin-command-home\) \.content\{margin-left:0!important\}/);
  assert.match(css,/body:not\(\.admin-command-home\) \.ekodi-assist\.history-only\{display:none!important\}/);
  assert.match(css,/body:not\(\.admin-command-home\) \.ekodi-assist:not\(\.history-only\) \.ekodi-assist-rail\{display:none!important\}/);
  assert.match(css,/\.ekodi-assist\.history-only \.ekodi-assist-main\{display:none!important\}/);
  assert.match(bootstrap,/A\(0\)\.then\(H\)/);
  assert.ok(js.includes('ekodi-admin-section-changed'));
});