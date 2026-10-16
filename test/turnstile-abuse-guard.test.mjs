import test from 'node:test';
import assert from 'node:assert/strict';
import { turnstileEscalationConfigured, turnstileEscalationHeaders, verifyTurnstileEscalation } from '../turnstile-abuse-guard.js';

test('Turnstile public-write escalation is inert until explicitly enabled with a secret',async()=>{
  assert.equal(turnstileEscalationConfigured({TURNSTILE_PUBLIC_WRITE_ESCALATION:'enabled'}),false);
  const result=await verifyTurnstileEscalation(new Request('https://ekodi.kr/mail/contact'),{});
  assert.equal(result.configured,false);
  assert.equal(result.success,false);
});

test('configured Turnstile advertises only public challenge metadata',()=>{
  const headers=turnstileEscalationHeaders({
    TURNSTILE_PUBLIC_WRITE_ESCALATION:'enabled',
    TURNSTILE_SECRET_KEY:'server-secret',
    TURNSTILE_SITE_KEY:'public-site-key',
  });
  assert.equal(headers['x-ekodi-turnstile-required'],'1');
  assert.equal(headers['x-ekodi-turnstile-sitekey'],'public-site-key');
  assert.equal(JSON.stringify(headers).includes('server-secret'),false);
});

test('Turnstile verification accepts valid EKODI host and rejects mismatched host',async()=>{
  const base={
    TURNSTILE_PUBLIC_WRITE_ESCALATION:'enabled',
    TURNSTILE_SECRET_KEY:'server-secret',
  };
  const request=new Request('https://ekodi.kr/mail/contact',{headers:{'x-ekodi-turnstile-token':'token','cf-connecting-ip':'203.0.113.7'}});
  const good=await verifyTurnstileEscalation(request,{
    ...base,
    TURNSTILE_VERIFY_FETCH:async()=>new Response(JSON.stringify({success:true,hostname:'ekodi.kr'}),{status:200}),
  });
  assert.equal(good.success,true);
  const bad=await verifyTurnstileEscalation(request,{
    ...base,
    TURNSTILE_VERIFY_FETCH:async()=>new Response(JSON.stringify({success:true,hostname:'evil.example'}),{status:200}),
  });
  assert.equal(bad.success,false);
  assert.equal(bad.reason,'hostname_mismatch');
});
