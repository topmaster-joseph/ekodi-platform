import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEkodiAdult } from '../age-verification-client.js';

const originalFetch=globalThis.fetch, originalPortOne=globalThis.PortOne;
let provider, requests, sdkPayload, sdkReply;
beforeEach(()=>{
  provider='kg-inicis-unified';requests=[];sdkPayload=null;sdkReply={};
  globalThis.PortOne={
    async requestIdentityVerification(payload){sdkPayload=payload;return sdkReply;}
  };
  globalThis.fetch=async (url,options)=>{
    assert.match(options.headers.Authorization,/^Bearer example-token$/);
    const pathname=String(url);
    requests.push({path:pathname,body:JSON.parse(options.body||'{}')});
    if(pathname.endsWith('/start'))
      return new Response(JSON.stringify({
        provider, identityVerificationId:'ekodi-inicis-'+'1'.repeat(32),
        storeId:'store-demo12345',channelKey:'channel-key-inicis12345'
      }),{status:201});
    if(pathname.endsWith('/complete'))
      return new Response(JSON.stringify({verified:true,site:'singles',policy:'civil_adult_19'}));
    throw Error('Unexpected endpoint '+pathname);
  };
});
after(()=>{globalThis.fetch=originalFetch;globalThis.PortOne=originalPortOne;});

test('KG Inicis SDK receives mandatory bypass flgFixedUser N without personal fields',async()=>{
  const outcome=await verifyEkodiAdult({
    site:'singles',accessToken:'example-token',
    redirectUrl:'https://ekodi.kr/verify/adult/?site=singles'
  });
  assert.equal(outcome.verified,true);
  assert.equal(sdkPayload.storeId,'store-demo12345');
  assert.equal(sdkPayload.channelKey,'channel-key-inicis12345');
  assert.equal(sdkPayload.identityVerificationId,'ekodi-inicis-'+'1'.repeat(32));
  assert.equal(sdkPayload.redirectUrl,'https://ekodi.kr/verify/adult/?site=singles');
  assert.deepEqual(sdkPayload.bypass,{inicisUnified:{flgFixedUser:'N'}});
  for(const raw of ['customer','birthDate','phoneNumber','fullName','directAgency','FRGNDInfo'])
    assert.ok(!JSON.stringify(sdkPayload).includes(raw));
  assert.deepEqual(requests.map(x=>x.path),[
    '/api/age-verification/start','/api/age-verification/complete'
  ]);
  assert.equal(requests[1].body.site,'singles');
});

test('legacy PortOne channel stays backward-compatible without Inicis bypass',async()=>{
  provider='portone-v2';
  await verifyEkodiAdult({site:'singles',accessToken:'example-token'});
  assert.ok(!('bypass' in sdkPayload));
});

test('unknown or forged server-selected provider never launches SDK',async()=>{
  provider='unknown-backend-provider';
  await assert.rejects(
    verifyEkodiAdult({site:'singles',accessToken:'example-token'}),
    /provider_unavailable/
  );
  assert.equal(sdkPayload,null);
  assert.equal(requests.length,1);
});

test('SDK provider cancellation never requests server completion',async()=>{
  sdkReply={code:'USER_CANCEL',message:'cancel'};
  await assert.rejects(verifyEkodiAdult({site:'singles',accessToken:'example-token'}),/provider_not_verified/);
  assert.equal(requests.length,1);
});

test('site parameters cannot inject external destinations or override server provider',async()=>{
  await assert.rejects(verifyEkodiAdult({site:'../../evil',accessToken:'example-token'}),/invalid_site/);
  assert.equal(requests.length,0);
});
