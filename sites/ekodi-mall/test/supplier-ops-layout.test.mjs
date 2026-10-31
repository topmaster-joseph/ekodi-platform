import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../assets/supplier-ops.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/supplier-ops-layout.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/supplier-ops.js',import.meta.url),'utf8');

test('supplier operations show only one task panel and can restore a selected step',()=>{
  const names=['partner','contract','source','sku','mapping'];
  for(const [i,name] of names.entries()){
    assert.match(html,new RegExp('role="tab" id="ops-tab-'+name+'" aria-controls="ops-step-'+name+'"'));
    assert.match(html,new RegExp('id="ops-step-'+name+'" role="tabpanel" aria-labelledby="ops-tab-'+name+'" data-ops-step="'+name+'"'+(i?' hidden':'')));
  }
  assert.match(html,/class="ops-grid ops-step-panels"/);
  assert.match(css,/\.supplier-ops-page \.ops-step-panels \.ops-panel\[hidden\]\{display:none!important\}/);
  assert.match(js,/function activateStep\(step,writeUrl=false\)/);
  assert.match(js,/new URLSearchParams\(location\.search\)\.get\('step'\)/);
  assert.match(js,/history\.replaceState\(null,''/);
  assert.match(css,/@media\(max-width:560px\)/);
});
test('logged-out state hides logout and clears retained partner data',()=>{
  assert.match(html,/id="opsLogin" type="button">운영자 로그인<\/button>/);
  assert.match(html,/id="opsLogout" type="button" hidden>로그아웃<\/button>/);
  assert.match(css,/#opsLogout\[hidden\]\{display:none!important\}/);
  assert.match(js,/login\.hidden=signed/);
  assert.match(js,/logout\.hidden=!signed/);
  assert.match(js,/if\(!canOperate\)\{/);
  assert.match(js,/context=blankContext\(\); selectedPartnerId=''/);
  assert.match(js,/renderGates\(\);renderSummary\(\);renderPartners\(\)/);
});
test('existing gated Supplier Ops forms and API calls are retained',()=>{
  for(const id of ['opsGates','opsSummary','partnerCreateForm','partnerDetailsForm','partnerSelect','sourceCreateForm','existingSourceSelect','contractVerifyForm','skuForm','mappingForm','mappingRows','partnerReadiness'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const endpoint of ['/api/internal/supplier-pilot/context','/api/internal/supplier-partners','/api/internal/supplier-skus/'])assert.ok(js.includes(endpoint),endpoint);
  assert.match(js,/https:\/\/ekodi\.kr\/auth\//);
  assert.match(js,/return_to/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/자동발주 OFF/);
  assert.doesNotMatch(html,/name="password"|name="apiKey"/);
});

test('ops UI only enables mutation after server authorization and discards stale results',()=>{
  assert.match(js,/const signed=Boolean\(session\), canOperate=signed&&operationsAuthorized/);
  assert.match(js,/el.disabled=!canOperate/);
  assert.match(js,/operationsAuthorized = true;/);
  assert.match(js,/operationsAuthorized = false;/);
  assert.match(js,/const result = await api\('\/api\/internal\/supplier-pilot\/context'\)/);
  assert.match(js,/revision !== authRevision/);
  assert.match(js,/session.user\?\.id !== actor/);
  assert.match(js,/\+\+authRevision; operationsAuthorized=false; session=null; syncUi\(\)/);
  assert.match(js,/if\(!canOperate\)/);
});
