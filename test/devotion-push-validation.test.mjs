import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePushSubscription,sameOriginRequest} from '../message/devotion-push-validation.js';
const good = {site:'mission',consentVersion:'devotional-push-v1',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}}};
test('accepts consented supported push provider',()=>assert.equal(validatePushSubscription(good).site,'mission'));
test('blocks arbitrary endpoint SSRF and invalid consent',()=>{
  for (const endpoint of ['http://localhost:8080','https://127.0.0.1/push','https://evil.example/push','https://fcm.googleapis.com.evil.example/push']) {
    assert.throws(()=>validatePushSubscription({...good,subscription:{...good.subscription,endpoint}}));
  }
  assert.throws(()=>validatePushSubscription({...good,consentVersion:'none'}));
});
test('requires same origin JSON write',()=>{
  const req=(origin,type='application/json')=>new Request('https://ekodi.kr/api/message/subscribe',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:'{}'});
  assert.equal(sameOriginRequest(req('https://ekodi.kr')),true);
  assert.equal(sameOriginRequest(req('https://evil.example')),false);
  assert.equal(sameOriginRequest(req('https://ekodi.kr','text/plain')),false);
});
