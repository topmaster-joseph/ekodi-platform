import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('space/app.js');
const worker=read('space-worker.js');

test('public operating-space sign-in directs to apex /auth/ preserving functional query only',()=>{
  const line=app.split('\n').find(s=>s.startsWith('function authStart(){'));
  assert.ok(line,'client authStart exists');
  function initiate(href){
    const location={href,assigned:''};
    location.assign=x=>location.assigned=x;
    runInNewContext(line+';authStart()', {URL,location});
    return new URL(location.assigned);
  }
  const from=initiate('https://ekodi.kr/jadam/admin/site?month=2026-10#private');
  assert.equal(from.origin,'https://ekodi.kr');
  assert.equal(from.pathname,'/auth/');
  assert.equal(from.searchParams.get('site'),'space');
  assert.equal(from.searchParams.get('return_to'),'https://ekodi.kr/jadam/admin/site?month=2026-10');
  for(const hostile of ['https://outside.example/jadam','http://ekodi.kr/jadam','https://ekodi.kr/admin/control','https://ekodi.kr/auth/']){
    assert.equal(initiate(hostile).searchParams.get('return_to'),'https://ekodi.kr/space/');
  }
});

test('legacy operating-space auth/start proxy restricts return_to to canonical user pages',()=>{
  const start=worker.indexOf('function authRedirect(request,env){');
  const end=worker.indexOf('\nasync function appShell(',start);
  assert.ok(start>=0&&end>start,'worker auth redirect exists');
  const fn=runInNewContext('('+worker.slice(start,end).trim()+')',{URL,Response,withHeaders:(_env,r)=>r});
  function redirect(from){return new URL(fn({url:from},{}).headers.get('location'))}
  const trusted=redirect('https://ekodi.kr/space/auth/start?return_to='+encodeURIComponent('https://ekodi.kr/pizzamaru/admin/site?active=1#secret'));
  assert.equal(trusted.pathname,'/auth/');
  assert.equal(trusted.searchParams.get('site'),'space');
  assert.equal(trusted.searchParams.get('return_to'),'https://ekodi.kr/pizzamaru/admin/site?active=1');
  for(const returnTo of ['https://outside.example/','https://ekodi.kr/admin','http://ekodi.kr/pizzamaru','https://ekodi.kr/auth/']){
    const u=redirect('https://ekodi.kr/space/auth/start?return_to='+encodeURIComponent(returnTo));
    assert.equal(u.searchParams.get('return_to'),'https://ekodi.kr/space/');
  }
  assert.equal(redirect('https://ekodi.kr/space/auth/start').searchParams.get('return_to'),'https://ekodi.kr/space/');
});

test('both operating-space runtime configs and public Worker use constitutional auth and admin',()=>{
  const live=read('wrangler.space.toml');
  const staging=read('wrangler.space.staging.toml');
  assert.ok(worker.includes("authUrl:'https://ekodi.kr/auth/?site=space'"));
  assert.ok(!worker.includes('env.AUTH_URL||'));
  assert.ok(worker.includes("form-action 'self' https://ekodi.kr"));
  assert.ok(worker.includes("Response.redirect('https://ekodi.kr/admin/?route=workspace&source=space',307)"));
  for(const config of [live,staging])assert.ok(config.includes('AUTH_URL = "https://ekodi.kr/auth/?site=space"'));
  assert.equal((new URL('https://ekodi.kr/auth/?site=space')).hostname,'ekodi.kr');
});
