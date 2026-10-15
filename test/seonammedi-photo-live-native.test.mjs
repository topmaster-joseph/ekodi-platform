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

test('live proof fails on photo errors, broken layout, horizontal overflow and false campus-photo claims',()=>{
  for(const fail of ['photo_not_rendered_','photo_not_visible_','photo_reference_disclosure_missing_',
    'six_side_menu_labels_mismatch_','site_header_not_sticky_','layout_region_missing_',
    'horizontal_overflow_','responsive_columns_mismatch_','selected_side_menu_not_active_'])
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
  assert.match(workflow,/continue-on-error: \$\{\{ github\.event_name == 'pull_request' \}\}/);
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
