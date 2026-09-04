import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [adminJs, siteWorker, mallHeaders, freeOpsJs, authRouter] = await Promise.all([
  readFile(new URL('../release-control-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/_headers', import.meta.url), 'utf8'),
  readFile(new URL('../sites/ekodi-mall/assets/free-ops.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8'),
]);

function headerBlock(path) {
  const normalized = mallHeaders.replace(/\r\n/g,'\n');
  const start = normalized.indexOf(`
${path}
`);
  assert.ok(start >= 0, `missing Mall header block: ${path}`);
  const rest = normalized.slice(start + 1);
  const next = rest.slice(path.length + 1).search(/\n\/[^\n]+\n/);
  return next < 0 ? rest : rest.slice(0, path.length + 1 + next);
}

test('admin sidebar renders canonical Mall Free Ops inside the content panel', () => {
  assert.ok(adminJs.includes("const MALL_FREE_OPS_URL = 'https://ekodi.kr/ekodibiz/mall/free-ops?embed=admin'"));
  for (const marker of ["dataset.section = 'mall-free-ops'","dataset.adminLink = 'mall-free-ops'","section.dataset.panel = 'mall-free-ops'","frame.dataset.mallFreeOpsFrame = 'true'",'allow-popups-to-escape-sandbox']) assert.ok(adminJs.includes(marker));
  assert.doesNotMatch(adminJs, /\/legacy#/);
  assert.ok(adminJs.includes('nav.append(button)'));
});

test('Admin CSP permits only Google sign-in plus the first-party EKODI Mall canonical origin for frames', () => {
  assert.ok(siteWorker.includes('"frame-src https://accounts.google.com/gsi/ https://ekodi.kr"'));
  assert.match(siteWorker, /frame-ancestors 'none'/);
  assert.doesNotMatch(siteWorker, /frame-src[^\n]*https:\/\/mall\.ekodi\.kr/);
});

test('Mall keeps global anti-framing but grants Admin narrow Free Ops exceptions', () => {
  const globalBlock = mallHeaders.replace(/\r\n/g,'\n').slice(0, mallHeaders.replace(/\r\n/g,'\n').indexOf('/free-ops*'));
  assert.match(globalBlock, /X-Frame-Options: DENY/);
  assert.match(globalBlock, /frame-ancestors 'none'/);
  for (const path of ['/free-ops*','/assets/free-ops','/assets/free-ops.html']) {
    const block = headerBlock(path);
    assert.ok(block.includes('! X-Frame-Options'));
    assert.ok(block.includes('! Content-Security-Policy'));
    assert.ok(block.includes('frame-ancestors https://admin.ekodi.kr'));
  }
});

test('embedded Free Ops opens central auth and returns to the canonical Mall path', () => {
  assert.match(freeOpsJs, /EMBEDDED=.*embed.*admin/);
  assert.ok(freeOpsJs.includes("searchParams.set('site','mall')"));
  assert.ok(freeOpsJs.includes("searchParams.set('return_to','https://ekodi.kr/ekodibiz/mall/free-ops?embed=admin')"));
  assert.doesNotMatch(freeOpsJs, /site=mall-seller/);
  assert.ok(freeOpsJs.includes("window.open(AUTH_URL,'ekodiMallAuth'"));
  assert.ok(freeOpsJs.includes('refreshEmbeddedSession'));
  assert.ok(freeOpsJs.includes("addEventListener('storage'"));
});

test('central auth router repairs legacy Free Ops links before loading auth.js', () => {
  assert.ok(authRouter.includes("'mall-seller':'mall'"));
  assert.ok(authRouter.includes("!params.get('return_to')&&params.get('returnTo')"));
  assert.ok(authRouter.includes("params.set('return_to',params.get('returnTo'))"));
  assert.ok(authRouter.includes("params.delete('returnTo')"));
});
