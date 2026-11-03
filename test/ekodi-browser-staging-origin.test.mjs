import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveBrowserOrigin} from '../scripts/ekodi-background-browser-worker.mjs';
test('EKODI browser stays on ekodi.kr unless a development runner selects an allowlisted staging host',()=>{
  assert.equal(resolveBrowserOrigin({}),'https://ekodi.kr');
  const admin='https://ekodi-admin-staging.ekodi-development.workers.dev';
  assert.equal(resolveBrowserOrigin({EKODI_BROWSER_ORIGIN:admin,EKODI_BROWSER_ENVIRONMENT:'development'}),admin);
  assert.throws(()=>resolveBrowserOrigin({EKODI_BROWSER_ORIGIN:admin}),/allowlisted development staging/);
  assert.throws(()=>resolveBrowserOrigin({EKODI_BROWSER_ORIGIN:'https://example.workers.dev',EKODI_BROWSER_ENVIRONMENT:'development'}),/allowlisted/);
  assert.throws(()=>resolveBrowserOrigin({EKODI_BROWSER_ORIGIN:'https://ekodi-admin-staging.ekodi-development.workers.dev.evil.test',EKODI_BROWSER_ENVIRONMENT:'development'}),/allowlisted/);
});
test('Access service token headers are only added to same-origin staging requests',()=>{
  const src=readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
  assert.match(src,/const STAGING_ACCESS = ORIGIN!==CANONICAL_ORIGIN &&/);
  assert.match(src,/if\(STAGING_ACCESS && new URL\(req\.url\(\)\)\.origin===ORIGIN\)/);
});
test('points staging browser workflow is development-only and always revokes its ephemeral credentials',()=>{
  const wf=readFileSync(new URL('../.github/workflows/verify-points-staging-browser.yml',import.meta.url),'utf8');
  assert.match(wf,/environment: development/);
  assert.match(wf,/DEV_REF: lxcxwbdwwojjkgybbqii/);
  assert.doesNotMatch(wf,/renzehysxirjilvdxacv|ekodi\.kr\/api|CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(wf,/name: Revoke ephemeral session, member and fixtures\n\s+if: always\(\)/);
  for(const s of ['DELETE FROM sessions','DELETE FROM admins','delete from public.people','auth/v1/admin/users/$E2E_MEMBER_ID'])assert.ok(wf.includes(s),s);
  assert.match(wf,/echo "::add-mask::\$key"/);assert.match(wf,/echo "::add-mask::\$token"/);assert.match(wf,/echo "::add-mask::\$hash"/);
  assert.match(wf,/EKODI_BROWSER_ENVIRONMENT: development/);
});
