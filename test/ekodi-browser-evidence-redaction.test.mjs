import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redactNativeBrowserUrl, sanitizeNativeBrowserReceipt, sanitizeNativeBrowserFailure
} from '../scripts/ekodi-background-browser-worker.mjs';

test('canonical browser location redacts query credentials and volatile CDP challenge path',()=>{
  assert.equal(redactNativeBrowserUrl('https://ekodi.kr/admin/?code=verysecret&email=a%40b.kr#token'),
    'https://ekodi.kr/admin/');
  assert.equal(redactNativeBrowserUrl('/admin/?session=private&state=abc'),'/admin/');
  assert.equal(redactNativeBrowserUrl('https://ekodi.kr/cdn-cgi/challenge-platform/h/g/precursor/5c2e6b612edd/0.secret'),
    'https://ekodi.kr/cdn-cgi/challenge-platform/[redacted]');
  assert.equal(redactNativeBrowserUrl('javascript:alert(1)'),'[redacted-url]');
});

test('receipt strips secrets before JSON artifact output and preserves the verification contract',()=>{
  const before={
    ok:true,
    canonicalOrigin:'https://ekodi.kr',
    finalUrl:'https://ekodi.kr/admin/?token=private',
    virtualizationProvider:'ekodi-background-browser-worker',
    performance:{navigations:2,p50Ms:100,p95Ms:140,maxMs:140},
    navigationTimings:[{path:'/my/?jwt=private',elapsedMs:100,attempts:1,status:200}],
    blockedMutations:[{
      method:'POST',
      url:'https://ekodi.kr/cdn-cgi/challenge-platform/h/g/precursor/nonceOfNoOne/verySecret'
    }],
    pageErrors:[{
      url:'https://ekodi.kr/admin?authorization=secret',
      message:'Browser request Bearer testBearerSecret1234 failed; contact a.person@example.com 010-3501-8542'
    }],
    results:[{type:'snapshot',url:'https://ekodi.kr/admin/?state=verysecret',
      bodyText:'authorization=temporarySecret; example.user@example.com 01035018542'}]
  };
  const result=sanitizeNativeBrowserReceipt(before);
  assert.equal(result.canonicalOrigin,'https://ekodi.kr');
  assert.equal(result.finalUrl,'https://ekodi.kr/admin/');
  assert.deepEqual(result.performance,before.performance);
  assert.equal(result.navigationTimings[0].path,'/my/');
  assert.equal(result.results[0].url,'https://ekodi.kr/admin/');
  assert.equal(result.blockedMutations[0].url,'https://ekodi.kr/cdn-cgi/challenge-platform/[redacted]');
  assert.match(result.pageErrors[0].message,/\[redacted-phone\]/);
  assert.match(result.pageErrors[0].message,/\[redacted-email\]/);
  const artifact=JSON.stringify(result);
  for(const secret of ['private','nonceOfNoOne','verySecret','testBearerSecret1234','example.user@example.com','a.person@example.com','01035018542','010-3501-8542','temporarySecret'])
    assert.ok(!artifact.includes(secret),secret+' leaked in browser receipt');
  assert.equal(before.finalUrl,'https://ekodi.kr/admin/?token=private','sanitization must not mutate the original evidence structure');
});

test('native worker rejects arbitrary error codes and redacts failed-run diagnostics',()=>{
  const err=new Error('Request https://ekodi.kr/admin/?code=example-private-value could not complete');
  err.code='INVALID;UNTRUSTED';
  const out=sanitizeNativeBrowserFailure(err);
  assert.equal(out.ok,false);
  assert.equal(out.code,'BROWSER_WORKER_FAILED');
  assert.ok(!JSON.stringify(out).includes('example-private-value'));
  assert.match(out.message,/https:\/\/ekodi.kr\/admin\//);
  assert.ok(out.completedAt);
});
