import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import siteShellWorker,{isShellIsolatedControlPath} from '../site-shell-worker.js';
import {injectEkodiShell} from '../ekodi-shell-injector.js';

test('only canonical /control HTML and assets bypass the shared workspace Shell',()=>{
  for(const p of ['/control','/control/','/CONTROL','/control.css','/control.js'])
    assert.equal(isShellIsolatedControlPath(p),true,p);
  for(const p of ['/','/control-center','/controls','/control/news','/my','/admin'])
    assert.equal(isShellIsolatedControlPath(p),false,p);
});

test('standalone Control route leaves original admin UI markup intact',async()=>{
  const expected='<!doctype html><html lang="ko" data-ekodi-control="v2" data-ekodi-shell-surface="admin" data-ekodi-character="off"><head></head><body><main id="viewChat">Control</main></body></html>';
  const env={ASSETS:{fetch:async()=>new Response(expected,{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}};
  const request=new Request('https://ekodi.kr/control');
  const response=await siteShellWorker.fetch(request,env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'control-surface');
  const html=await response.text();
  assert.match(html,/data-ekodi-shell-surface="admin"/);
  assert.match(html,/data-ekodi-character="off"/);
  assert.doesNotMatch(html,/\/shell\/shell\.js|data-ekodi-user-ui="v1"|ekodi-header-root/);
});

test('shared HTML injector refuses to mutate a protected Control response',async()=>{
  const original=new Response('<html data-ekodi-control="v2"><body>private operations</body></html>',{
    headers:{'content-type':'text/html; charset=utf-8','x-ekodi-route':'control-surface'}
  });
  assert.strictEqual(injectEkodiShell(original,'ekodi','workspace'),original);
  const canonical=new Response('<html></html>',{
    headers:{'content-type':'text/html','x-ekodi-canonical-surface':'control'}
  });
  assert.strictEqual(injectEkodiShell(canonical,'ekodi','public'),canonical);
});

test('route ownership is protected by both site-shell and independent router',async()=>{
  const read=async f=>readFile(new URL('../'+f,import.meta.url),'utf8');
  const [wrapper,router,standalone,injector]=await Promise.all([
    read('site-shell-worker.js'),read('platform-router-entry-worker.js'),
    read('site-worker.js'),read('ekodi-shell-injector.js')
  ]);
  assert.match(wrapper,/if\(rootInternalPath\(pathname\)\|\|isWorkspaceAdminPathShape\(pathname\)\)return response/);
  assert.match(wrapper,/path==='\/control'/);
  assert.match(router,/x-ekodi-route','control-surface/);
  assert.match(standalone,/x-robots-tag|X-Robots-Tag/i);
  assert.match(injector,/if\(route==='control-surface'\|\|canonical==='control'\)return response/);
});
