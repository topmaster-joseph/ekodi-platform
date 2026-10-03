import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceTurnstilePublicWrite, handleTurnstileSecurityApi, turnstilePublicConfig, verifyTurnstileResponse, TURNSTILE_CONSTANTS } from '../turnstile-protection.js';

const env={
  TURNSTILE_ENFORCEMENT:'enabled',
  TURNSTILE_SITE_KEY:'site-key',
  TURNSTILE_SECRET_KEY:'secret-key',
};

test('Turnstile config is public-key-only and disabled until all bindings exist',async()=>{
  assert.equal(turnstilePublicConfig({}).enabled,false);
  const config=turnstilePublicConfig(env);
  assert.equal(config.enabled,true);
  assert.equal(config.sitekey,'site-key');
  assert.equal(config.appearance,'interaction-only');
  assert.equal(config.execution,'execute');
  assert.equal(config.action,'public_write');
  assert.ok(TURNSTILE_CONSTANTS.PROTECTED_PATHS.includes('/api/seonammedi/voices'));
  const response=handleTurnstileSecurityApi(new Request('https://ekodi.kr/api/security/turnstile/config'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.sitekey,'site-key');
  assert.equal(JSON.stringify(body).includes('secret-key'),false);
});

test('protected public writes require a Turnstile token only after enforcement is enabled',async()=>{
  const request=new Request('https://ekodi.kr/api/seonammedi/voices',{method:'POST',body:'{}'});
  assert.equal(await enforceTurnstilePublicWrite(request,{}),null);
  const blocked=await enforceTurnstilePublicWrite(request,env);
  assert.equal(blocked.status,403);
  assert.equal((await blocked.json()).code,'TURNSTILE_REQUIRED');
});

test('Siteverify validates action and request hostname',async()=>{
  const ok=await verifyTurnstileResponse({
    token:'token',
    secret:'secret',
    expectedHostname:'www.seonammedi.kr',
    fetchImpl:async()=>new Response(JSON.stringify({success:true,action:'public_write',hostname:'seonammedi.kr'}),{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(ok.ok,true);

  const wrongAction=await verifyTurnstileResponse({
    token:'token',
    secret:'secret',
    expectedHostname:'ekodi.kr',
    fetchImpl:async()=>new Response(JSON.stringify({success:true,action:'other',hostname:'ekodi.kr'}),{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(wrongAction.ok,false);
  assert.equal(wrongAction.reason,'action_mismatch');

  const wrongHost=await verifyTurnstileResponse({
    token:'token',
    secret:'secret',
    expectedHostname:'ekodi.kr',
    fetchImpl:async()=>new Response(JSON.stringify({success:true,action:'public_write',hostname:'example.com'}),{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.equal(wrongHost.ok,false);
  assert.equal(wrongHost.reason,'hostname_mismatch');
});
