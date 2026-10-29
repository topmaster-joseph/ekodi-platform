import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../sites/ekodi-insurance/public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function setupAdvisorChat(){');
const htmlStart=source.indexOf('  section.innerHTML=',start);
const htmlEnd=source.indexOf(';\n  section.querySelector(',htmlStart);
assert.ok(start>=0 && htmlStart>start && htmlEnd>htmlStart);
const expression=source.slice(htmlStart+'  section.innerHTML='.length,htmlEnd);
const canonicalRule=/const canonicalInsurancePage=([^;]+);/.exec(source);
assert.ok(canonicalRule);

function chatHtml(hostname,pathname){
  const script='const canonicalInsurancePage='+canonicalRule[1]+'; const html='+expression+'; html;';
  return vm.runInNewContext(script,{location:{hostname,pathname}});
}

test('canonical /insurance displays accurate privacy and admin messaging without the injected server bridge',()=>{
  const html=chatHtml('ekodi.kr','/insurance');
  assert.doesNotMatch(html,/STAGING|스테이징/);
  assert.match(html,/\/admin\/services\/insurance/);
  assert.match(html,/서버 연결이 안 되면 요청이 접수되지 않습니다/);
  assert.match(html,/연락정보를 암호화해 전송/);
  assert.match(html,/대화 원문 공유는 별도 선택사항/);
  assert.match(html,/선택동의한 대화내용만/);
  assert.match(html,/설계사 연락 요청/);
});

test('historical staging environment retains local-only explanation and legacy admin link',()=>{
  const html=chatHtml('legacy-insurance.invalid','/');
  assert.match(html,/STAGING/);
  assert.match(html,/스테이징에서는 요청과 상담대화가 같은 브라우저에만 보관됩니다/);
  assert.match(html,/href="\/admin"/);
  assert.doesNotMatch(html,/href="\/admin\/services\/insurance"/);
});

test('canonical classification does not confuse similarly prefixed paths or foreign hosts',()=>{
  assert.match(chatHtml('example.org','/insurance'),/STAGING/);
  assert.match(chatHtml('ekodi.kr','/insurance-other'),/STAGING/);
  assert.doesNotMatch(chatHtml('ekodi.kr','/insurance/advisor'),/STAGING/);
});
