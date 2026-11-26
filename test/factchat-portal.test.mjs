import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeFactChatPortal, isFactChatPortalPath, factChatLoginUrl, FACTCHAT_UNIVERSITIES, FACTCHAT_PORTAL_JS } from '../factchat-portal-route.js';

const get=(path,method='GET')=>routeFactChatPortal(new Request('https://ekodi.kr'+path,{method}));

test('portal only claims /factchat paths', ()=>{
  assert.equal(isFactChatPortalPath('/factchat'),true);
  assert.equal(isFactChatPortalPath('/factchat/mokpo/chat'),true);
  assert.equal(isFactChatPortalPath('/factchatx'),false);
  assert.equal(isFactChatPortalPath('/admin'),false);
});

test('guide page explains FactChat and lists universities with strict headers', async ()=>{
  const res=await get('/factchat/');
  assert.equal(res.status,200);
  const html=await res.text();
  assert.match(html,/BAZE Enterprise/);
  assert.match(html,/href="\/factchat\/mokpo"/);
  assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal(res.headers.get('cache-control'),'no-store');
  assert.match(res.headers.get('x-robots-tag'),/noindex/);
  assert.doesNotMatch(html,/<script>(?!<\/script>)/,'no inline script');
});

test('university page links to the university own FactChat sign-in in a new tab', async ()=>{
  const html=await (await get('/factchat/mokpo')).text();
  assert.match(html,/href="https:\/\/mokpo\.factchat\.bot\/" target="_blank" rel="noopener noreferrer" data-factchat-login/);
  assert.match(html,/href="\/factchat\/mokpo\/chat" data-factchat-admin-chat/);
  assert.doesNotMatch(html,/id="fcInput"/,'sign-in page carries no admin chat');
});

test('admin chat lives on /chat and goes through the super_admin playground path', async ()=>{
  const html=await (await get('/factchat/mokpo/chat')).text();
  assert.match(html,/data-factchat-provider="factchat-institution"/);
  assert.match(html,/id="fcInput"/);
  assert.match(FACTCHAT_PORTAL_JS,/\/api\/ai-modules\/v1\/providers\/admin\//);
  assert.match(FACTCHAT_PORTAL_JS,/x-ekodi-confirm-impact':'factchat-institution-playground'/);
  assert.match(FACTCHAT_PORTAL_JS,/super_admin/);
});

test('sign-in links are pinned to the university host over https', ()=>{
  const u=FACTCHAT_UNIVERSITIES[0];
  assert.equal(factChatLoginUrl(u),'https://mokpo.factchat.bot/');
  assert.equal(factChatLoginUrl({...u,loginUrl:'https://evil.example/'}),'');
  assert.equal(factChatLoginUrl({...u,loginUrl:'http://mokpo.factchat.bot/'}),'');
  assert.equal(factChatLoginUrl({...u,loginUrl:'javascript:alert(1)'}),'');
});

test('unknown universities, odd paths and writes are refused', async ()=>{
  assert.equal(await get('/factchat/../admin'),null,'normalized traversal is not claimed');
  for(const path of ['/factchat/unknown','/factchat/mokpo/other','/factchat/MOKPO%2F']){
    const res=await get(path);
    assert.equal(res.status,302,path);
    assert.equal(new URL(res.headers.get('location')).pathname,'/factchat/');
  }
  assert.equal((await get('/factchat/mokpo/chat','POST')).status,405);
  assert.equal((await get('/factchat/app.js')).headers.get('content-type'),'text/javascript; charset=utf-8');
});

test('router mounts the portal on the public host and deploy lanes observe it', ()=>{
  const router=readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/isFactChatPortalPath\(url\.pathname\)\)return routeFactChatPortal/);
  assert.match(readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),/factchat-portal-route\.js/);
  assert.match(readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8'),/factchat-portal-route\.js/);
});
