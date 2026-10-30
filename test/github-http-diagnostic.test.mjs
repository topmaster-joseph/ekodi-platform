import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGitHubHttp,parseCurlHeaders,safeGitHubHttpDiagnostic} from '../scripts/github-http-diagnostic.mjs';
const nowMs=Date.parse('2026-10-30T00:00:00Z');
const h=(v,extra={})=>({'x-ratelimit-remaining':String(v),'x-ratelimit-limit':'5000',
  'x-ratelimit-reset':String(Math.floor(nowMs/1000)+3600),'x-ratelimit-resource':'core',...extra});
test('primary 403 quota exhaust and measured reset',()=>{
  const x=classifyGitHubHttp({status:403,headers:h(0),data:{message:'API rate limit exceeded'},nowMs});
  assert.equal(x.classification,'primary_rate_limit');assert.equal(x.blockedUntilMs,nowMs+3600000);
});
test('secondary 403 Retry-After',()=>{
  const x=classifyGitHubHttp({status:403,headers:h(22,{'retry-after':'77'}),data:{message:'secondary rate limit'},nowMs});
  assert.equal(x.classification,'secondary_rate_limit');assert.equal(x.retryAt,nowMs+77000);
});
test('permission denial takes priority over quota interpretation',()=>{
  const x=classifyGitHubHttp({status:403,headers:h(0),data:{message:'Resource not accessible by integration'},nowMs});
  assert.equal(x.classification,'permission_denied');assert.equal(x.blockedUntilMs,null);
});
test('unknown 403 is not an invented rate limit',()=>{
  const x=classifyGitHubHttp({status:403,headers:{},data:{message:'Forbidden'},nowMs});
  assert.equal(x.classification,'unknown_403');assert.equal(x.remaining,null);assert.equal(x.blockedUntilMs,null);
});
test('invalid header fields and unknown resources ignored',()=>{
  const x=classifyGitHubHttp({status:429,headers:{'retry-after':'forever','x-ratelimit-remaining':'-1',
    'x-ratelimit-reset':'malformed','x-ratelimit-resource':'SECRET'},data:{message:'Too many requests'},nowMs});
  assert.equal(x.classification,'secondary_rate_limit');assert.equal(x.retryAt,null);
  assert.equal(x.remaining,null);assert.equal(x.resource,null);
});
test('only final response and allowlisted headers',()=>{
  const x=parseCurlHeaders('HTTP/1.1 200 Connection established\r\n\r\nHTTP/2 403\r\nAuthorization: Bearer SECRET\r\nx-ratelimit-remaining: 0\r\n\r\n');
  assert.equal(x['x-ratelimit-remaining'],'0');assert.equal(x.authorization,undefined);
});
test('no secret or raw message printed',()=>{
  const x=safeGitHubHttpDiagnostic({status:403,headers:h(21,{'authorization':'Bearer SECRET'}),
    data:{message:'Resource not accessible by integration SECRET private@example.com'},nowMs});
  assert.match(x,/permission_denied/);assert.doesNotMatch(x,/SECRET|private@example.com|Bearer/);
});
test('401 and 422 fail without quota classification',()=>{
  for(const [s,c] of [[401,'authentication_failed'],[422,'policy_rejected'],[503,'http_error']])
    assert.equal(classifyGitHubHttp({status:s,headers:{},data:{},nowMs}).classification,c);
});
