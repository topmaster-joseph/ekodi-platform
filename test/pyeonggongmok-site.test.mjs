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
