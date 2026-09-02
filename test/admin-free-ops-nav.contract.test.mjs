import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [adminJs, mallHeaders, freeOpsJs, authRouter] = await Promise.all([
  readFile(new URL('../release-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/_headers', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/assets/free-ops.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8'),
]);

test('admin sidebar renders Mall Free Ops inside the right content panel', () => {
  assert.match(adminJs, /MALL_FREE_OPS_URL = 'https:\/\/mall\.ekodi\.kr\/free-ops\?embed=admin'/);
  assert.match(adminJs, /dataset\.section = 'mall-free-ops'/);
  assert.match(adminJs, /dataset\.adminLink = 'mall-free-ops'/);
  assert.match(adminJs, /Mall · Free Ops/);
  assert.match(adminJs, /section\.dataset\.panel = 'mall-free-ops'/);
  assert.match(adminJs, /frame\.dataset\.mallFreeOpsFrame = 'true'/);
  assert.match(adminJs, /allow-popups-to-escape-sandbox/);
  assert.doesNotMatch(adminJs, /link\.target = '_blank'[\s\S]{0,180}dataset\.adminLink = 'mall-free-ops'/);
  assert.doesNotMatch(adminJs, /\/legacy#/);
  assert.match(adminJs, /nav\.append\(button\)/);
});


test('Mall keeps global anti-framing but grants Admin a narrow Free Ops exception', () => {
  const globalBlock = mallHeaders.slice(0, mallHeaders.indexOf('/free-ops*'));
  assert.match(globalBlock, /X-Frame-Options: DENY/);
  assert.match(globalBlock, /frame-ancestors 'none'/);
  assert.match(mallHeaders, /\/free-ops\*[\s\S]*! X-Frame-Options[\s\S]*! Content-Security-Policy[\s\S]*frame-ancestors https:\/\/admin\.ekodi\.kr/);
  assert.match(mallHeaders, /\/assets\/free-ops\r?\n[\s\S]*! X-Frame-Options[\s\S]*! Content-Security-Policy[\s\S]*frame-ancestors https:\/\/admin\.ekodi\.kr/);
  assert.match(mallHeaders, /\/assets\/free-ops\.html[\s\S]*! X-Frame-Options[\s\S]*frame-ancestors https:\/\/admin\.ekodi\.kr/);
});

test('embedded Free Ops opens central auth outside the frame and returns to Mall Free Ops', () => {
  assert.match(freeOpsJs, /EMBEDDED=.*embed.*admin/);
  assert.match(freeOpsJs, /searchParams\.set\('site','mall'\)/);
  assert.match(freeOpsJs, /searchParams\.set\('return_to','https:\/\/mall\.ekodi\.kr\/free-ops\?embed=admin'\)/);
  assert.doesNotMatch(freeOpsJs, /site=mall-seller/);
  assert.doesNotMatch(freeOpsJs, /returnTo=/);
  assert.match(freeOpsJs, /window\.open\(AUTH_URL,'ekodiMallAuth'/);
  assert.match(freeOpsJs, /refreshEmbeddedSession/);
  assert.match(freeOpsJs, /addEventListener\('storage'/);
});

test('central auth router repairs legacy Free Ops links before loading auth.js', () => {
  assert.match(authRouter, /'mall-seller':'mall'/);
  assert.match(authRouter, /!params\.get\('return_to'\)&&params\.get\('returnTo'\)/);
  assert.match(authRouter, /params\.set\('return_to',params\.get\('returnTo'\)\)/);
  assert.match(authRouter, /params\.delete\('returnTo'\)/);
});
