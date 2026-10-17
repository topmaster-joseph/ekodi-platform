import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  safePublicHttps,intakePermission,validateVendorSubmission,handleCheonggyePassVendorIntake,
} from '../cheonggyepass-vendor-intake.js';
import { regionalCommerceProgramById } from '../regional-commerce-program-registry.js';
import { localRegionBySlug } from '../local-region-registry.js';
import { regionalCommerceProgramAdminPage,regionalCommerceProgramPublicPage } from '../regional-commerce-program-page.js';
import { cheonggyePassVendorIntakeScript } from '../cheonggyepass-vendor-intake-ui.js';

const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('supports exact github PR provenance without public credential URLs',()=>{
  const hash='a'.repeat(40);
  const parsed=validateVendorSubmission({
    delivery:'github_pr',vendorName:'외부 개발사',sourceUrl:'https://github.com/example/vendor-pass/pull/41',sourceRef:hash,
  });
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value.sourceRef,hash);
  assert.equal(parsed.value.sourceUrl,'https://github.com/example/vendor-pass/pull/41');
  for(const sourceUrl of [
    'http://github.com/example/vendor-pass/pull/1',
    'https://github.com/example/vendor-pass',
    'https://github.com/example/vendor-pass/pull/1?token=secret',
    'https://user:pass@github.com/example/vendor-pass/pull/1',
    'https://github.com.evil.test/example/vendor-pass/pull/1',
    'https://localhost/example/vendor-pass/pull/1',
  ])assert.equal(validateVendorSubmission({delivery:'github_pr',vendorName:'외부 개발사',sourceUrl}).ok,false,sourceUrl);
  assert.equal(validateVendorSubmission({delivery:'github_pr',vendorName:'외부 개발사',sourceUrl:'https://github.com/a/b/pull/1',sourceRef:'main'}).ok,false);
});

test('external API contract requires public HTTPS endpoints and health capability',()=>{
  const valid={delivery:'external_api',vendorName:'청계패스 공급업체',
    apiBaseUrl:'https://api.vendor.co.kr/v1',documentationUrl:'https://docs.vendor.co.kr/openapi',
    capabilities:['health','merchant-status','coupon']};
  const parsed=validateVendorSubmission(valid);
  assert.equal(parsed.ok,true);
  assert.deepEqual(parsed.value.capabilities,['health','merchant-status','coupon']);
  assert.equal(validateVendorSubmission({...valid,capabilities:['coupon']}).code,'API_HEALTH_REQUIRED');
  assert.equal(validateVendorSubmission({...valid,capabilities:['health','unknown']}).code,'API_CAPABILITIES_INVALID');
  for(const endpoint of [
    'http://api.vendor.co.kr/v1','https://localhost/v1','https://127.0.0.1/v1',
    'https://169.254.169.254/latest','https://api.vendor.co.kr:8443/v1',
    'https://user:pw@api.vendor.co.kr/v1','https://api.vendor.co.kr/v1?api_key=abc',
    'https://example.internal/v1',
  ])assert.equal(validateVendorSubmission({...valid,apiBaseUrl:endpoint}).ok,false,endpoint);
  assert.equal(safePublicHttps('https://api.vendor.co.kr/v1'),'https://api.vendor.co.kr/v1');
});

test('ZIP request cannot smuggle API, credentials or source data',()=>{
  const valid=validateVendorSubmission({delivery:'zip',vendorName:'외주 개발팀'});
  assert.equal(valid.ok,true);
  assert.equal(validateVendorSubmission({delivery:'zip',vendorName:'외주 개발팀',apiBaseUrl:'https://api.vendor.co.kr/v1'}).ok,false);
  assert.equal(validateVendorSubmission({delivery:'zip',vendorName:'외주 개발팀',token:'secret'}).ok,false);
  assert.equal(validateVendorSubmission({delivery:'external_api',vendorName:'외주 개발팀',
    apiBaseUrl:'https://api.vendor.co.kr/v1',documentationUrl:'https://docs.vendor.co.kr/',secret:'x'}).ok,false);
  assert.equal(validateVendorSubmission({delivery:'zip',vendorName:'A'}).ok,false);
});

test('vendor and developer permissions cannot review, manage secrets, finance or deploy',()=>{
  const vendor={ok:true,role:'external_vendor',email:'vendor@example.co.kr',capabilities:['tenant.integration.inspect']};
  const developer={ok:true,role:'external_developer',capabilities:['tenant.pr.create']};
  const manager={ok:true,role:'admin',canManageAccess:true,capabilities:['tenant.integration.inspect']};
  const viewer={ok:true,role:'viewer',capabilities:['tenant.dashboard.read']};
  for(const actor of [vendor,developer]){
    assert.equal(intakePermission(actor,'submit'),true);
    assert.equal(intakePermission(actor,'review'),false);
  }
  assert.equal(intakePermission(manager,'review'),true);
  assert.equal(intakePermission(viewer,'read'),false);
  assert.equal(intakePermission(null,'submit'),false);
  assert.equal(intakePermission({ok:true,role:'external_vendor',canManageAccess:true,capabilities:['*']},'review'),false);
});

test('intake is private and closed when DB binding absent or path unregistered',async()=>{
  const wrong=await handleCheonggyePassVendorIntake(new Request('https://ekodi.kr/api/elsewhere'),{});
  assert.equal(wrong,null);
  const missing=await handleCheonggyePassVendorIntake(new Request('https://ekodi.kr/api/cheonggyepass/vendor-intake'),{});
  assert.equal(missing.status,503);
  assert.equal(missing.headers.get('cache-control'),'private, no-store');
  assert.equal((await missing.json()).code,'INTAKE_DATABASE_UNAVAILABLE');
});

test('integration UI is private, CSP-compatible, and keeps canonical public page unchanged',async()=>{
  const region=localRegionBySlug('cheonggye');
  const pass=regionalCommerceProgramById('cheonggye-pass');
  const publicHtml=await regionalCommerceProgramPublicPage(region,pass).text();
  const adminHtml=await regionalCommerceProgramAdminPage(region,pass).text();
  assert.doesNotMatch(publicHtml,/data-pass-vendor-intake|vendor-intake-ui/);
  assert.match(publicHtml,/서비스 준비 중/);
  assert.match(adminHtml,/data-pass-vendor-intake hidden/);
  assert.match(adminHtml,/data-pass-intake-form/);
  assert.match(adminHtml,/data-pass-intake-list/);
  assert.match(adminHtml,/GitHub PR/);
  assert.match(adminHtml,/ZIP 파일/);
  assert.match(adminHtml,/외부 서버 API 연동/);
  assert.match(adminHtml,/local-region-admin-auth\.js/);
  assert.match(adminHtml,/cheonggyepass-vendor-intake-ui\.js/);
  const script=cheonggyePassVendorIntakeScript();
  assert.match(script.headers.get('content-type')||'',/text\/javascript/);
  const js=await script.text();
  assert.match(js,/ekodi:region-access-ready/);
  assert.match(js,/x-ekodi-intake-request/);
  assert.match(js,/crypto\.randomUUID\(\)/);
  assert.match(js,/textContent/);
  assert.doesNotMatch(js,/\beval\(/);
});

test('Control API, router and storage remain isolated from public and financial routes',async()=>{
  const [entry,router,config,sql]=await Promise.all([
    read('customer-entry-worker.js'),read('platform-router-entry-worker.js'),
    read('wrangler.api.toml'),read('migrations/0151_cheonggyepass_vendor_intake.sql'),
  ]);
  assert.match(entry,/handleCheonggyePassVendorIntake/);
  assert.match(entry,/path\.startsWith\('\/api\/cheonggyepass\/vendor-intake'\)/);
  assert.match(router,/cheonggyePassVendorIntakeScript\(\)/);
  assert.match(router,/\/cheonggye\/cheonggyepass-vendor-intake-ui\.js/);
  assert.match(config,/binding = "PASS_VENDOR_QUARANTINE"/);
  assert.match(config,/bucket_name = "ekodi-pass-vendor-quarantine"/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS cheonggyepass_vendor_submissions/);
  assert.match(sql,/UNIQUE \(actor_email,submission_key\)/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS cheonggyepass_vendor_events/);
  assert.doesNotMatch(sql,/\bDROP TABLE\b|\bDELETE FROM\b/);
  const runtime=await read('cheonggyepass-vendor-intake.js');
  assert.match(runtime,/resolveRegionalAccess\(request,env,'cheonggye-pass'\)/);
  assert.match(runtime,/credential/);
  assert.match(runtime,/quarantine\/cheonggyepass\//);
  assert.match(runtime,/INTAKE_SCAN_ATTESTATION_REQUIRED/);
  assert.match(runtime,/financialExecutionEnabled:false/);
  assert.doesNotMatch(runtime,/fetch\(.*apiBaseUrl/);
  assert.doesNotMatch(runtime,/tenant\.production\.deploy/);
});
