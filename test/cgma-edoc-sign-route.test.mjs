import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCgmaEdocSignPath, routeCgmaEdocSign } from '../cgma-edoc-sign-route.js';

const base='https://ekodi.kr/cgma/sign';
const files={
  '/cgma/sign/':['prototypes/cgma-edoc-sign.html','text/html; charset=utf-8'],
  '/cgma/sign/app.js':['prototypes/cgma-edoc-sign.js','text/javascript'],
};
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const env={ASSETS:{async fetch(request){
  const hit=files[new URL(request.url).pathname];
  return hit?new Response(read(hit[0]),{headers:{'content-type':hit[1]}}):new Response('Not Found',{status:404});
}}};

test('path matcher is limited to the signing subtree',()=>{
  assert.equal(isCgmaEdocSignPath('/cgma/sign'),true);
  assert.equal(isCgmaEdocSignPath('/cgma/sign/'),true);
  assert.equal(isCgmaEdocSignPath('/cgma/signup'),false);
  assert.equal(isCgmaEdocSignPath('/cgma/admin/edocs'),false);
});
test('canonical slash redirect, GET only, unknown files 404',async()=>{
  for(const from of ['','/index.html']){
    const r=await routeCgmaEdocSign(new Request(base+from),env);
    assert.equal(r.status,308);assert.equal(r.headers.get('location'),base+'/');
  }
  assert.equal((await routeCgmaEdocSign(new Request(base+'/',{method:'POST'}),env)).status,405);
  assert.equal((await routeCgmaEdocSign(new Request(base+'/secret.json'),env)).status,404);
  assert.equal((await routeCgmaEdocSign(new Request(base+'/'),{})).status,503);
});
test('page carries strict CSP, no-store, noindex and workspace identity',async()=>{
  const r=await routeCgmaEdocSign(new Request(base+'/'),env);
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-ekodi-workspace'),'cgma');
  assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  const csp=r.headers.get('content-security-policy');
  assert.match(csp,/script-src 'self'/);assert.match(csp,/connect-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
  assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/);
  const js=await routeCgmaEdocSign(new Request(base+'/app.js'),env);
  assert.equal(js.status,200);assert.match(js.headers.get('content-type'),/javascript/);
});
test('page has no inline script, keeps the token in the fragment and uses only the same-origin API',()=>{
  const html=read('prototypes/cgma-edoc-sign.html');
  assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/);
  assert.match(html,/<script src="\/cgma\/sign\/app\.js"/);
  const js=read('prototypes/cgma-edoc-sign.js');
  assert.match(js,/const API='\/api\/cgma\/edocs\/sign'/);
  assert.match(js,/location\.hash/);
  assert.match(js,/'x-ekodi-sign-token'/);
  assert.match(js,/'x-ekodi-edoc-request','1'/);
  assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(js.replace("'http://www.w3.org/2000/svg'",''),/https?:\/\//);
});
test('router delegates the signing page before publication guards, and build ships it',()=>{
  const router=read('platform-router-entry-worker.js');
  assert.match(router,/import \{ isCgmaEdocSignPath, routeCgmaEdocSign \} from '\.\/cgma-edoc-sign-route\.js';/);
  assert.match(router,/if\(host===PUBLIC_HOST&&isCgmaEdocSignPath\(url\.pathname\)\)return routeCgmaEdocSign\(request,env\);/);
  const guarded=router.indexOf('isCgmaEdocSignPath(incomingUrl.pathname)');
  assert.ok(guarded>0&&guarded<router.indexOf('const publicationGuard=await sitePublicationGuard'),'must run before the publication guard');
  const build=read('scripts/build.mjs');
  assert.match(build,/cp\(`\$\{root\}prototypes\/cgma-edoc-sign\.html`,`\$\{output\}cgma\/sign\/index\.html`\)/);
  assert.match(build,/cp\(`\$\{root\}prototypes\/cgma-edoc-sign\.js`,`\$\{output\}cgma\/sign\/app\.js`\)/);
});
