import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = file => readFileSync(new URL('../'+file, import.meta.url),'utf8');
test('Search visibility ledger is routed through protected Control API',()=>{
  const control=read('search-visibility-control.js');
  const router=read('mission-control-entry-worker.js');
  assert.match(router,/handleSearchVisibilityControl/);
  assert.match(router,/path === '\/api\/control\/search-visibility'/);
  assert.match(control,/session\?\.authenticated&&session\?\.role==='super_admin'/);
  assert.match(control,/authWorker\.fetch/);
  assert.match(control,/sameOrigin\(request\)/);
  assert.match(control,/if\(!env\?\.DB\?\.prepare\)/);
  assert.match(control,/\['GET','PATCH'\]/);
  assert.match(control,/JSON_REQUIRED/);
  assert.match(control,/PAYLOAD_TOO_LARGE/);
});
test('Only registered public site/domain properties may receive manual evidence',()=>{
  const code=read('search-visibility-control.js');
  assert.match(code,/buildEkodiPublicRegistry\(env\)/);
  assert.match(code,/listSitePublicationSettings\(env\)/);
  assert.match(code,/s\.publicStatus==='public'/);
  assert.match(code,/SITE_NOT_PUBLIC/);
  assert.match(code,/UNKNOWN_PROVIDER/);
  assert.match(code,/AI_REGISTRATION_NOT_SUPPORTED/);
  assert.match(code,/CONFIRMATION_REQUIRES_EVIDENCE/);
  assert.match(code,/EVIDENCE_MUST_BE_HTTPS/);
  assert.match(code,/independent-domain/);
  assert.match(code,/PRIMARY KEY\(site_url,provider_id,check_type\)/);
  assert.match(code,/search_visibility_audit/);
  assert.match(code,/env\.DB\.batch\(writes\)/);
});
test('Provider state is not confused with automatic verification and IndexNow is only Naver submission',()=>{
  const control=read('search-visibility-control.js'),view=read('search-visibility-admin.js');
  for(const id of ['naver','google','daum','bing','indexnow-bing','indexnow-naver','indexnow-yandex','indexnow-seznam','indexnow-yep','indexnow-amazon','ai-chatgpt','ai-google','ai-copilot','ai-perplexity','ai-claude'])
    assert.match(control,new RegExp("id:'"+id+"'"));
  assert.match(control,/confirmed_manually/);
  assert.match(control,/policy:'manual_confirmation_not_provider_api_verification'/);
  assert.match(control,/status:'naver_submission_only'/);
  assert.match(view,/source==='manual'/);
  assert.match(view,/수동 근거 확인/);
  assert.match(view,/providerSummary/);
  assert.match(view,/data-sv-ledger-status/);
  assert.match(view,/crossOrigin\?/);
});
test('New backend and front end scripts parse cleanly',()=>{
  for(const filename of ['search-visibility-control.js','search-visibility-admin.js','mission-control-entry-worker.js']){
    const parsed=spawnSync(process.execPath,['--check',new URL('../'+filename,import.meta.url).pathname],{encoding:'utf8'});
    assert.equal(parsed.status,0,parsed.stderr);
  }
});
