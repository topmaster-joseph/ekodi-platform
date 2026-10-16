import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const client=source('auth-site/client-auth.js');
const service=source('auth-site/auth.js');
const bootstrap=source('auth-site/auth-bootstrap.js');
const policy=JSON.parse(source('config/service-workspace-policy.json')).authenticationReturnPolicy;

function recoverReferrer({href='https://ekodi.kr/auth/?site=portal',referrer=''}) {
  const location=new URL(href);
  let redirected='';
  const history={state:{},replaceState(_state,_title,next){redirected=next}};
  const document={referrer,title:'EKODI 인증',documentElement:{dataset:{}}};
  runInNewContext(bootstrap,{URL,URLSearchParams,location,document,history});
  return redirected ? new URL(redirected) : location;
}

function clientReturn(site,raw,fallback,origins){
  const start=client.indexOf('const CANONICAL_MOUNTS=');
  const end=client.indexOf('function cancelledLoginTarget()',start);
  assert.ok(start>=0&&end>start,'universal return policy source exists');
  const config={kind:site,returnTo:fallback,origins:origins||[new URL(fallback).origin]};
  const params=new URLSearchParams({site,return_to:raw});
  const context={URL,URLSearchParams,Set,Object,site,config,params,DIRECT_LOGIN:false};
  return runInNewContext(client.slice(start,end)+'\nRETURN_TO;',context);
}

function serviceReturn(site,raw,fallback,origins){
  const start=service.indexOf('const SERVICE_CANONICAL_MOUNTS=');
  const end=service.indexOf('const sb=createClient(',start);
  assert.ok(start>=0&&end>start,'legacy service return policy source exists');
  const config={returnTo:fallback,origins:origins||[new URL(fallback).origin]};
  const params=new URLSearchParams({site,return_to:raw});
  return runInNewContext(service.slice(start,end)+'\nreturnTo;',{
    URL,URLSearchParams,Object,site,config,params,marketing:false,isMarketingReturnOrigin:()=>false
  });
}

test('legacy auth links recover only a trustworthy initiating URL, with the query intact',()=>{
  const exact='https://ekodi.kr/ekodichurch/worship?week=2026-10-18&mode=edit';
  assert.equal(recoverReferrer({referrer:exact}).searchParams.get('return_to'),exact);
  const seonam='https://seonammedi.kr/board/voices?compose=1&draft=7';
  assert.equal(recoverReferrer({href:'https://ekodi.kr/auth/?site=seonammedi',referrer:seonam}).searchParams.get('return_to'),seonam);
  assert.equal(recoverReferrer({referrer:'https://untrusted.example/my'}).searchParams.has('return_to'),false);
  assert.equal(recoverReferrer({referrer:'https://ekodi.kr/auth/?site=my'}).searchParams.has('return_to'),false);
  assert.equal(recoverReferrer({href:'https://ekodi.kr/auth/?site=church&return_to=https%3A%2F%2Fekodi.kr%2Fekodichurch%2Fadmin%3Ftab%3Dnotices',referrer:'https://ekodi.kr/'}).searchParams.get('return_to'),'https://ekodi.kr/ekodichurch/admin?tab=notices');
});

test('universal identity never substitutes My EKODI for a different starting service',()=>{
  assert.equal(clientReturn('church','https://ekodi.kr/ekodichurch/admin?section=notice','https://ekodi.kr/ekodichurch/'),'https://ekodi.kr/ekodichurch/admin?section=notice');
  assert.equal(clientReturn('church','https://ekodi.kr/my/','https://ekodi.kr/ekodichurch/'),'https://ekodi.kr/ekodichurch/');
  assert.equal(clientReturn('church','https://ekodi.kr/ekodipay','https://ekodi.kr/ekodichurch/'),'https://ekodi.kr/ekodichurch/');
  assert.equal(clientReturn('space','https://ekodi.kr/ekodibiz/doraji/admin?tab=contracts','https://ekodi.kr/'),'https://ekodi.kr/ekodibiz/doraji/admin?tab=contracts');
  assert.equal(clientReturn('portal','https://ekodi.kr/edu/lesson?device=tablet','https://ekodi.kr/'),'https://ekodi.kr/edu/lesson?device=tablet');
  assert.equal(clientReturn('edu','https://malicious.ekodi.kr/edu/lesson','https://edu.ekodi.kr/'),'https://edu.ekodi.kr/');
  assert.equal(clientReturn('edu','https://ekodi.kr/admin/','https://edu.ekodi.kr/'),'https://edu.ekodi.kr/');
  assert.equal(clientReturn('my','https://ekodi.kr/my/folders?folder=123','https://ekodi.kr/my/'),'https://ekodi.kr/my/folders?folder=123');
  assert.equal(clientReturn('seonammedi','https://seonammedi.kr/board/voices?compose=1','https://seonammedi.kr/', ['https://seonammedi.kr']),'https://seonammedi.kr/board/voices?compose=1');
  assert.equal(clientReturn('seonammedi','https://ekodi.kr/seonammedi/board/voices?compose=1','https://seonammedi.kr/', ['https://seonammedi.kr']),'https://ekodi.kr/seonammedi/board/voices?compose=1');
});

test('legacy workspace login likewise restores paths and rejects other-service targets',()=>{
  assert.equal(serviceReturn('pay','https://ekodi.kr/ekodipay/order?id=123','https://ekodi.kr/ekodipay',['https://ekodi.kr']),'https://ekodi.kr/ekodipay/order?id=123');
  assert.equal(serviceReturn('pay','https://ekodi.kr/my/','https://ekodi.kr/ekodipay',['https://ekodi.kr']),'https://ekodi.kr/ekodipay');
  assert.equal(serviceReturn('portal','https://ekodi.kr/edu/lesson?id=123','https://ekodi.kr',['https://ekodi.kr']),'https://ekodi.kr/edu/lesson?id=123');
  assert.equal(serviceReturn('portal','https://evil.example/steal','https://ekodi.kr',['https://ekodi.kr']),'https://ekodi.kr');
});

test('system-level return policy, minimized chooser and versioned auth are guarded',()=>{
  for(const k of ['mandatoryForExistingAndFutureSites','requireInitiatingHrefOnLoginLink','trustedReferrerRecoveryIfMissing','preserveExactPathAndQuery','blockCrossServiceRedirect','noAutomaticMyEkodiTransfer','compactGoogleChooserSurface','regressionTestsRequired'])assert.equal(policy[k],true,k);
  assert.match(source('auth-site/index.html'),/width:min\(100%,360px\)/);
  assert.match(source('admin-direct-google.js'),/width=420,height=580/);
  assert.match(source('auth-site/index.html'),/auth-bootstrap\.js\?v=20261017-exact-origin-1/);
  assert.match(source('auth-site/auth-entry.js'),/auth-router\.js\?v=20261017-exact-origin-1/);
  assert.match(source('auth-site/auth-router.js'),/client-auth\.js\?v=20261017-exact-origin-1/);
});
