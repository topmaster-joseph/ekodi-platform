import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const client=readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const realmLine=client.match(/^\s*cgma:\{name:'청계면상인회'.*\},$/m)?.[0];

function cgmaSafeReturn(raw){
  assert.ok(realmLine,'site=cgma must have its own login realm (not the portal fallback)');
  const config=runInNewContext('({'+realmLine.trim().replace(/,$/,'')+'}).cgma');
  const start=client.indexOf('function safeReturn(raw){');
  const end=client.indexOf('const RETURN_TO=',start);
  return runInNewContext(client.slice(start,end)+'\nsafeReturn(raw)',{raw,URL,DIRECT_LOGIN:true,config});
}

test('CGMA admin links return to the exact page after login, not the EKODI homepage',()=>{
  for(const page of ['https://ekodi.kr/cgma/admin/edocs','https://ekodi.kr/cgma/admin/member','https://ekodi.kr/cgma/admin/festival','https://ekodi.kr/cgma/member']){
    assert.equal(cgmaSafeReturn(page),page,page);
  }
  assert.equal(cgmaSafeReturn('https://cgma.or.kr/notice'),'https://cgma.or.kr/notice');
});

test('CGMA realm never returns to other workspaces or untrusted hosts; fallback is the CGMA home',()=>{
  for(const bad of ['https://ekodi.kr/admin/','https://ekodi.kr/ekodimall','https://ekodi.kr/','https://evil.example/cgma/admin','http://ekodi.kr/cgma/admin/edocs','https://user:pw@ekodi.kr/cgma/']){
    assert.equal(cgmaSafeReturn(bad),'https://ekodi.kr/cgma/',bad);
  }
  assert.equal(cgmaSafeReturn(''),'https://ekodi.kr/cgma/');
});
