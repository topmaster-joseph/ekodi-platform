import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import platformRouter from '../platform-router-entry-worker.js';

const root=new URL('../sites/pyeonggongmok/public/',import.meta.url);

test('PGM public site keeps the Drive-grounded lifelong-learning identity at the short canonical URL',async()=>{
  const [html,css,build,router,workflow,manifest]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.css',root),'utf8'),
    readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),
    readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8')
  ]);
  assert.match(html,/https:\/\/ekodi\.kr\/pgm/);
  assert.match(html,/href="\/pgm\/app\.css"/);
  assert.match(html,/href="\/pgm\/admin"/);
  assert.doesNotMatch(html,/https:\/\/ekodi\.kr\/pyeonggongmok/);
  assert.match(html,/평생공부하는 목회자/);
  assert.match(html,/매주 화요일 오전 10시/);
  assert.match(html,/읽기 · 질문 · 나눔 · 적용 · 피드백/);
  assert.match(html,/Google Drive 평공목 폴더 기준/);
  assert.match(html,/저작권/);
  assert.match(html,/공개권한/);
  assert.match(css,/\.study-grid/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(build,/sites\/pyeonggongmok\/public.*output}pgm/);
  assert.match(router,/PGM_PREFIX='\/pgm'/);
  assert.match(router,/PYEONGGONGMOK_LEGACY_PREFIX='\/pyeonggongmok'/);
  assert.match(router,/content-type','text\/css; charset=utf-8'/);
  assert.match(workflow,/sites\/pyeonggongmok\/public\/\*\*/);
  assert.match(workflow,/test\/pyeonggongmok-site\.test\.mjs/);
  assert.match(manifest,/https:\/\/ekodi\.kr\/pgm/);
});

test('Shared Site router serves /pgm with CSS MIME, redirects the old URL, and serves the site-owned admin at the canonical /pgm/admin URL',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    return new Response(path,{status:200,headers:{'content-type':'application/octet-stream'}});
  }}};

  const home=await platformRouter.fetch(new Request('https://ekodi.kr/pgm'),env,{});
  assert.equal(home.status,200);
  assert.equal(home.headers.get('x-ekodi-route'),'pgm-static');
  assert.equal(await home.text(),'/pgm/');

  const css=await platformRouter.fetch(new Request('https://ekodi.kr/pgm/app.css'),env,{});
  assert.equal(css.status,200);
  assert.equal(css.headers.get('x-ekodi-route'),'pgm-static');
  assert.match(css.headers.get('content-type')||'',/^text\/css/);
  assert.equal(await css.text(),'/pgm/app.css');

  const legacy=await platformRouter.fetch(new Request('https://ekodi.kr/pyeonggongmok?x=1'),env,{});
  assert.equal(legacy.status,308);
  assert.equal(legacy.headers.get('location'),'https://ekodi.kr/pgm?x=1');
  assert.equal(legacy.headers.get('x-ekodi-route'),'pgm-canonical');

  const slash=await platformRouter.fetch(new Request('https://ekodi.kr/pgm/'),env,{});
  assert.equal(slash.status,308);
  assert.equal(slash.headers.get('location'),'https://ekodi.kr/pgm');

  const legacySlash=await platformRouter.fetch(new Request('https://ekodi.kr/pyeonggongmok/'),env,{});
  assert.equal(legacySlash.status,308);
  assert.equal(legacySlash.headers.get('location'),'https://ekodi.kr/pgm');

  const legacyAdmin=await platformRouter.fetch(new Request('https://ekodi.kr/pyeonggongmok/admin'),env,{});
  assert.equal(legacyAdmin.status,308);
  assert.equal(legacyAdmin.headers.get('location'),'https://ekodi.kr/pgm/admin');

  const admin=await platformRouter.fetch(new Request('https://ekodi.kr/pgm/admin'),env,{});
  assert.equal(admin.status,200);
  assert.equal(admin.headers.get('x-ekodi-route'),'workspace-admin');
  const adminHtml=await admin.text();
  assert.match(adminHtml,/EKODI Workspace Admin/);
  assert.match(adminHtml,/workspace-admin\.js/);
});
