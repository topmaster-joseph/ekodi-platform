import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../scripts/verify-seonammedi-photo-live-native.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-hero-native.yml',import.meta.url),'utf8');

test('production read-only visual proof covers both public origins and all six menu categories',()=>{
  for(const origin of ['https://seonammedi.kr','https://ekodi.kr'])
    assert.ok(script.includes("'"+origin+"'"),origin);
  for(const path of ['board/notices','#committee-activity','#timeline','#channels','board/voices','#organization'])
    assert.ok(script.includes("path:'"+path+"'"),path);
  assert.match(script,/name:'pc',width:1440/);
  assert.match(script,/name:'mobile',width:390/);
  assert.match(script,/browser\.newContext/);
  assert.match(script,/await context\.newPage\(\)/);
  assert.match(script,/route\.abort\('blockedbyclient'\)/);
  assert.match(script,/route\.request\(\)\.method\(\)/);
});

test('live proof rejects a duplicate stock banner and requires the campaign only on home',()=>{
  for(const fail of ['unexpected_shared_photo_','home_only_campaign_visibility_mismatch_',
    'incorrect_home_campaign_source_','home_campaign_dimensions_mismatch_',
    'six_header_menu_labels_mismatch_','duplicate_left_menu_present_',
    'site_header_not_sticky_','layout_region_missing_',
    'horizontal_overflow_','responsive_columns_mismatch_'])
    assert.ok(script.includes(fail),fail);
  assert.match(script,/report\.success=report\.failures\.length===0/);
  assert.match(script,/if\(!report\.success\)process\.exitCode=1/);
  assert.match(script,/production-photo-evidence\.json/);
  assert.doesNotMatch(script,/(?:localStorage|sessionStorage|Bearer |setCookie|request\.post|request\.put|request\.delete)/);
});

test('post-deploy workflow asserts both origins and collects original and new screenshot evidence',()=>{
  assert.match(workflow,/name: Verify six-menu real photo on both production domains/);
  assert.match(workflow,/node scripts\/verify-seonammedi-photo-live-native\.mjs --origin=https:\/\/ekodi\.kr/);
  assert.match(workflow,/node scripts\/verify-seonammedi-photo-live-native\.mjs --origin=https:\/\/seonammedi\.kr/);
  assert.match(workflow,/if \[ "\$canonical_result" -ne 0 \] \|\| \[ "\$customer_result" -ne 0 \]/);
  assert.match(workflow,/artifacts\/native-photo-proof-\*/);
  assert.match(workflow,/cp sites\/seonammedi\/public\/board-central-category\.js \.tmp\/native-hero-site\/seonammedi\/board\/ui\/central-category\.js/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/Deploy EKODI Shared Site Core/);
  assert.ok(workflow.includes("if: github.event_name == 'workflow_dispatch' || (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main')"));
  assert.doesNotMatch(workflow,/continue-on-error:/,'live production failures must remain fatal');
  assert.ok(workflow.includes("ref: ${{ github.event_name == 'workflow_run' && 'main' || github.ref }}"));
});

test('live photo failure receipts preserve script HTTP status and browser bootstrap evidence',()=>{
  for(const token of [
    "scriptResponses:[],pageErrors:[]",
    "response.url().includes('board/ui/central-category.js')",
    "status:response.status()",
    "request.failure()?.errorText",
    "page.on('pageerror'",
    "entry.bootstrap=await page.evaluate",
    "document.documentElement.dataset.seonamVisualInitialized",
    "categoryScripts:",
    "scripts='+JSON.stringify(entry.scriptResponses)",
    "errors='+JSON.stringify(entry.pageErrors)"
  ])assert.ok(script.includes(token),token);
  assert.match(script,/state:'attached',timeout:4000/);
  assert.doesNotMatch(script,/page\.route\([^)]*\)\.fulfill/,'diagnostics must not mock production assets');
});

test('local source proof is isolated from live production and cannot fake board Worker pages',()=>{
  assert.ok(script.includes("const approvedLocal='http://127.0.0.1:8765'"));
  assert.ok(script.includes("const sourceMode=args['source-mode']==='true'"));
  assert.ok(script.includes("sourceMode ? origin!==approvedLocal : !approvedProduction.includes(origin)"));
  assert.ok(script.includes("sourceMode||origin==='https://ekodi.kr'"));
  assert.ok(script.includes("'EKODI-SEONAMMEDI-PHOTO-SOURCE-001'"));
  assert.ok(script.includes("mode:sourceMode?'source-preview':'production'"));
  assert.ok(script.includes("checks.filter(item=>!sourceMode||item.path.startsWith('#'))"));
  assert.match(workflow,/name: Verify six-menu photographic homepage against actual local source/);
  assert.ok(workflow.includes('--origin=http://127.0.0.1:8765 --source-mode=true'));
  assert.ok(workflow.includes('artifacts/native-photo-source'));
  assert.ok(workflow.includes('artifacts/native-photo-proof-canonical'));
  assert.ok(workflow.includes('artifacts/native-photo-proof-customer'));
  assert.ok(script.includes(".replace(/[^a-zA-Z0-9.-]/g,'-')"),'source screenshot names must not contain host port colons');
  assert.ok(script.includes("sourceMode?'source-photo-evidence.json':'production-photo-evidence.json'"),'source and production evidence must remain distinguishable');
  assert.doesNotMatch(script,/sourceMode\s*\?\s*true\s*:/,'source preview must never unconditionally pass checks');
});
