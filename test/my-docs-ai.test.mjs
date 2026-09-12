import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('my/docs/index.html');
const js=read('my/docs/docs.js');
const worker=read('my-worker.js');
const migration=read('supabase/migrations/20260907113000_document_workspace_ai.sql');
const healthMigration=read('supabase/migrations/20260907135500_document_workspace_health.sql');
const ai=read('supabase/functions/document-ai-api/index.ts');
const hwpx=read('my/docs/hwpx.js');
const registry=JSON.parse(read('config/capability-registry.json'));
const manifest=JSON.parse(read('deploy/manifests/my.worker.json'));

test('Docs AI exposes a human-controlled editable workspace',()=>{
  assert.match(html,/contenteditable="true"/);assert.match(html,/id="aiPreview"/);assert.match(html,/id="applyAi"/);assert.match(html,/AI는 바로 덮어쓰지 않습니다/);assert.match(html,/data-export="docx"/);assert.match(html,/data-export="hwpx"/);assert.match(html,/\.hwpx/);assert.match(html,/id="versionPanel"/);assert.match(html,/id="aiQuota"/);assert.match(html,/id="dropOverlay"/);assert.match(html,/긴 문서는 자동 분할/);assert.match(html,/HWPX/);assert.match(html,/id="sourceFileInput"/);assert.match(html,/id="downloadSource"/);
});
test('document client keeps auth, sanitization and storage boundaries explicit',()=>{
  assert.match(js,/document_files/);assert.match(js,/document_versions/);assert.match(js,/personal:\$\{session\.user\.id\}/);assert.match(js,/script,style,iframe,object,embed,form,input,button,meta,link/);assert.match(js,/mammoth@1\.9\.1\/mammoth\.browser\.min\.js/);assert.doesNotMatch(js,/mammoth@1\.9\.1\/\+esm/);assert.match(js,/docx@8\.5\.0/);assert.match(js,/importHwpx/);assert.match(js,/createHwpxBlob/);assert.match(js,/loadVersions/);assert.match(js,/extractRawText/);assert.match(js,/ensureEditorVisible/);assert.match(js,/dragstart/);assert.match(js,/dropOverlay/);assert.match(js,/document-ai-api/);assert.match(hwpx,/application\/hwp\+zip/);assert.match(hwpx,/MAX_HWPX_BYTES=20\*1024\*1024/);assert.match(hwpx,/ekodi\.hwpx\.roundtrip\.v2/);assert.match(js,/document-sources/);assert.match(js,/createRoundTripHwpxBlob/);
});
test('private document schema is owner-scoped and usage writes stay server-side',()=>{
  assert.match(migration,/alter table public\.document_files enable row level security/i);assert.match(migration,/auth\.uid\(\) = owner_user_id/);assert.match(migration,/workspace_key = \('personal:' \|\| auth\.uid\(\)::text\)/);assert.match(migration,/revoke insert, update, delete on public\.document_ai_usage from anon, authenticated/i);assert.match(healthMigration,/document_workspace_health/);assert.match(healthMigration,/ekodi\.documents\.v2/);
});
test('document AI is authenticated, canonical-origin aware, common-gateway-first and bounded',()=>{
  assert.match(ai,/authentication_required/);assert.match(ai,/DAILY_LIMIT/);assert.match(ai,/EKODI_AI_GATEWAY_URL/);assert.match(ai,/api\/ai-modules\/v1\/providers\/generate/);assert.match(ai,/invokeGateway/);assert.match(ai,/GEMINI_API_KEY/);assert.match(ai,/OPENAI_API_KEY/);assert.match(ai,/store:false/);assert.match(ai,/사용자가 제공하지 않은 사실/);assert.match(ai,/MAX_INPUT=120000/);assert.doesNotMatch(ai,/MAX_INPUT=18000|18,000자/);assert.match(ai,/CHUNK_INPUT=14000/);assert.match(ai,/invokeDocument/);assert.match(ai,/chunking:/);assert.match(ai,/const CANONICAL_ORIGIN="https:\/\/ekodi\.kr"/);assert.match(ai,/new Set\(\[CANONICAL_ORIGIN,"https:\/\/auth\.ekodi\.kr"\]\)/);assert.match(ai,/"origin":CANONICAL_ORIGIN/);assert.match(ai,/20260910-docs-ai-5/);assert.match(ai,/ekodi\.document-ai\.v2/);assert.match(ai,/X-EKODI-Docs-Contract/);
});
test('core.documents is service-backed with an observable provider contract',()=>{
  const capability=registry.capabilities.find(item=>item.id==='core.documents');assert.equal(capability?.maturity,'service-backed');assert.equal(capability?.provider?.id,'my-docs');assert.equal(capability?.provider?.contract,'ekodi.documents.v2');assert.equal(capability?.provider?.generation,8);assert.ok(capability?.provider?.formats?.import?.includes('hwpx'));assert.ok(capability?.provider?.formats?.export?.includes('hwpx'));
});
test('My EKODI advertises and probes the document workspace on the canonical production path',()=>{
  assert.match(worker,/documentWorkspace:true/);assert.match(worker,/documentCapability:'core\.documents'/);assert.match(worker,/documentContract:'ekodi\.documents\.v2'/);assert.match(worker,/documentHwpx:true/);assert.match(worker,/documentVersionHistory:true/);assert.match(worker,/url\.pathname==='\/docs'/);
  const docsProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/my/docs/');assert.ok(docsProbe);assert.ok(docsProbe.expect.includes('EKODI Docs AI'));assert.equal(docsProbe.candidateVerify,false);
  const docsAssetSrc=html.match(/<script type="module" src="([^"]*docs\.js\?v=[^"]+)"/)?.[1];assert.ok(docsAssetSrc);assert.ok(docsProbe.expect.includes(docsAssetSrc));
});
test('My guarded release smoke-tests the internal Worker candidate and defers canonical content probes until promotion',()=>{
  const requests=manifest.worker.requests;
  const candidate=requests.find(item=>item.url==='https://ekodi-my.topmaster-joseph.workers.dev/');
  assert.ok(candidate);assert.deepEqual(candidate.statuses,[200]);assert.equal(candidate.redirect,'manual');assert.ok(candidate.expect.includes('My EKODI'));
  const canonical=requests.filter(item=>item.url.startsWith('https://ekodi.kr/my/'));
  assert.equal(canonical.length,4);
  for(const probe of canonical){assert.equal(probe.candidateVerify,false);assert.match(probe.candidateVerifyReason,/verified after promotion/);}
  assert.equal(requests.filter(item=>item.url.startsWith('https://my.ekodi.kr/')).length,0);
});
