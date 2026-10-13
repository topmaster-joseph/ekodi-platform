import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=()=>readFile(new URL('../scripts/verify-admin-login-continuity.mjs',import.meta.url),'utf8');
const work=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('login continuity verifier uses canonical EKODI Admin path and session proof',async()=>{
  const src=await source();
  for(const item of [
    "const origin='https://ekodi.kr'",
    "const root=origin+'/admin/'",
    "const nested=origin+'/admin/services/common-services'",
    "await assertAuthenticatedSession(context.request)",
    "data?.authenticated!==true",
    "data?.role!=='super_admin'",
    "await page.goto(nested",
    "await page.reload(",
    "await waitForAdmin(page)",
    "app?.hidden===false",
    "login?.hidden===true",
    "deniedRedirects!==0",
    "HANDOFF_FRAGMENT_NOT_CLEARED",
  ])assert.ok(src.includes(item),item);
  assert.doesNotMatch(src,/https:\/\/admin\.ekodi\.kr/);
});
test('no bearer token, Google fragment, URL, or screenshot enters evidence',async()=>{
  const src=await source();
  assert.match(src,/E2E_ADMIN_TOKEN/);
  assert.match(src,/if\(!\/\^\[a-f0-9\]\{64\}\$\/i\.test\(token\)\)/);
  assert.match(src,/testKind:'issued-central-session-handoff-not-interactive-google-oauth'/);
  assert.match(src,/const codes=new Set\(/);
  assert.match(src,/console\.error\('\[EKODI\]\[ADMIN-CONTINUITY\] FAIL stage='\+stage\+' code='\+reason\)/);
  assert.doesNotMatch(src,/console\.log\([^\n]*(?:page\.url\(|token\b|authenticatedEntryUrl)/);
  assert.doesNotMatch(src,/page\.screenshot\(|trace\.start\(/);
});
test('both protected existing E2E workflows run continuity before menu sweeps',async()=>{
  for(const path of [
    '.github/workflows/admin-authenticated-e2e.yml',
    '.github/workflows/verify-admin-authenticated-production-e2e.yml'
  ]){
    const workflow=await work(path);
    const check=workflow.indexOf('run: node scripts/verify-admin-login-continuity.mjs');
    const sweep=workflow.indexOf('run: node scripts/admin-authenticated-e2e-retry.mjs');
    assert.ok(check>=0&&sweep>check,path+' continuity must precede menu sweep');
    assert.ok(workflow.includes('Issue short-lived genuine super-admin session'),path);
    assert.ok(workflow.includes('Revoke short-lived E2E session'),path);
    assert.ok(workflow.includes('::add-mask::$token'),path);
  }
});
