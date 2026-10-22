import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const load=()=>readFile(new URL('../sites/seonammedi/public/calendar-sidebar.js',import.meta.url),'utf8');

test('calendar diagnostics remain opt-in, admin-only and never start automatically',async()=>{
  const src=await load();
  assert.doesNotThrow(()=>new Script(src));
  assert.match(src,/new URLSearchParams\(location\.search\)\.get\('calendar_test'\)==='1'/);
  assert.match(src,/diagnosticMode\s*\?appendButton\(heading,'일정 저장 진단'/);
  assert.match(src,/if\(diagnostic\)diagnostic\.hidden=true/);
  assert.match(src,/if\(diagnostic\)diagnostic\.hidden=!admin/);
  assert.match(src,/if\(!diagnostic\|\|!admin\|\|diagnostic\.disabled\)return/);
  assert.match(src,/\(\)=>runWriteDiagnostic\(\)/);
  assert.doesNotMatch(src,/setInterval\(runWriteDiagnostic|setTimeout\(runWriteDiagnostic/);
});

test('live proof uses the current admin bearer session and verifies every write from public read-back',async()=>{
  const src=await load();
  assert.match(src,/const token=authToken\(\)/);
  assert.match(src,/headers\.set\('authorization','Bearer '\+token\)/);
  const start=src.indexOf('async function runWriteDiagnostic(){');
  const end=src.indexOf('async function removeEvent(item){',start);
  assert.ok(start>=0&&end>start);
  const body=src.slice(start,end);
  assert.match(body,/method:'POST'/);
  assert.match(body,/method:'PUT'/);
  assert.match(body,/method:'DELETE'/);
  assert.match(body,/kind:'event'/);
  assert.match(body,/status:'published'/);
  assert.match(body,/readBack\(probeMonth,id,row=>Boolean\(row&&row\.title===title/);
  assert.match(body,/readBack\(probeMonth,id,row=>Boolean\(row&&row\.title===modified\.title&&row\.body===modified\.body/);
  assert.match(body,/readBack\(probeMonth,id,row=>!row,'삭제 재조회'\)/);
  assert.ok(body.indexOf('method:\'POST\'')<body.indexOf('method:\'PUT\''));
  assert.ok(body.indexOf('method:\'PUT\'')<body.indexOf('method:\'DELETE\''));
  assert.match(body,/finally\s*\{[\s\S]*if\(id\)[\s\S]*method:'DELETE'/);
  assert.match(body,/if\(cleanupFailure\)status\.textContent=/);
  assert.match(body,/임시 일정 #/);
});

test('ordinary notice schedule save checks returned event id against refreshed calendar',async()=>{
  const src=await load();
  assert.match(src,/const result=await authorizedRequest\(API\+'\/admin\/notices'/);
  assert.match(src,/const persisted=events\.some\(item=>Number\(item\.id\)===Number\(result\.id\)&&item\.title===payload\.title\)/);
  assert.match(src,/중복 등록하지 말고 새로고침 후 확인해 주세요/);
  assert.match(src,/관리자 인증 또는 일정 관리 권한 확인 실패 \(HTTP /);
  assert.match(src,/일정 저장 요청 실패 \(HTTP /);
  assert.doesNotMatch(src,/document\.cookie\s*=|localStorage\.setItem\('ekodi-auth-token'/);
});
