import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import platformRouter from '../platform-router-entry-worker.js';

const root=new URL('../sites/pyeonggongmok/public/',import.meta.url);

test('pyeonggongmok public site reflects the Drive-grounded lifelong-learning identity',async()=>{
  const [html,css,build,router]=await Promise.all([
    readFile(new URL('index.html',root),'utf8'),
    readFile(new URL('app.css',root),'utf8'),
    readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
    readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/https:\/\/ekodi\.kr\/pyeonggongmok\//);
  assert.match(html,/평생공부하는 목회자/);
  assert.match(html,/매주 화요일 오전 10시/);
  assert.match(html,/읽기 · 질문 · 나눔 · 적용 · 피드백/);
  assert.match(html,/Google Drive 평공목 폴더 기준/);
  assert.match(html,/저작권/);
  assert.match(html,/공개권한/);
  assert.match(html,/\/pyeonggongmok\/admin\//);
  assert.match(css,/\.study-grid/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.match(build,/sites\/pyeonggongmok\/public/);
  assert.match(router,/PYEONGGONGMOK_PREFIX='\/pyeonggongmok'/);
  assert.match(router,/pyeonggongmok-static/);
});

test('Shared Site router serves pyeonggongmok before generic workspace routing',async()=>{
  const env={ENVIRONMENT:'production',ASSETS:{fetch:async request=>{
    const path=new URL(request.url).pathname;
    const type=path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
    return new Response(path,{status:200,headers:{'content-type':type}});
  }}};
  const home=await platformRouter.fetch(new Request('https://ekodi.kr/pyeonggongmok'),env,{});
  assert.equal(home.status,200);
  assert.equal(home.headers.get('x-ekodi-route'),'pyeonggongmok-static');
  assert.equal(await home.text(),'/pyeonggongmok/');
  const css=await platformRouter.fetch(new Request('https://ekodi.kr/pyeonggongmok/app.css'),env,{});
  assert.equal(css.status,200);
  assert.equal(css.headers.get('x-ekodi-route'),'pyeonggongmok-static');
  assert.equal(await css.text(),'/pyeonggongmok/app.css');
});


test('pyeonggongmok is production-discoverable and deployment-owned',async()=>{
  const [discoveryText,registryText,manifestText,serviceManifestText,workflow]=await Promise.all([
    readFile(new URL('../discovery-layer.js',import.meta.url),'utf8'),
    readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'),
    readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'),
    readFile(new URL('../ekodi-service-manifest.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8')
  ]);
  assert.match(discoveryText,/path: '\/pyeonggongmok'/);
  assert.match(discoveryText,/평공목 \| 평생공부하는 목회자/);
  const registry=JSON.parse(registryText);
  const service=registry.services.find(item=>item.id==='pyeonggongmok');
  assert.ok(service);
  assert.equal(service.url,'https://ekodi.kr/pyeonggongmok');
  assert.equal(service.productionVerified,true);
  assert.equal(service.homepage,false);
  assert.equal(service.status,'live');
  assert.match(serviceManifestText,/id:'pyeonggongmok'/);
  const manifest=JSON.parse(manifestText);
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/pyeonggongmok');
  assert.ok(probe);
  assert.deepEqual(probe.statuses,[200]);
  assert.ok(probe.headerExpect.includes('x-ekodi-route: pyeonggongmok-static'));
  assert.match(workflow,/sites\/pyeonggongmok\/public\/\*\*/);
  assert.match(workflow,/test\/pyeonggongmok-site\.test\.mjs/);
  const theme=JSON.parse(await readFile(new URL('../shell/theme.json',import.meta.url),'utf8'));
  assert.equal(theme.services.pyeonggongmok.identity,'pastoral-study-table');
  const wrangler=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/\"\/pyeonggongmok\\\*\"/);
});
