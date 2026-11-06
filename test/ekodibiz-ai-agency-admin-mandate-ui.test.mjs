import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async(path)=>readFile(new URL(path,import.meta.url),'utf8');
test('existing EKODIBIZ admin page adds one compact 3-month evidence and settlement panel',async()=>{
  const html=await read('../ekodibiz/ai-agency-admin.html');
  for(const id of ['opsDetail','settlementSummary','cycleForm','recordCycleBtn','renewalForm','stopRenewalBtn','exportStatement']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/실제 공급사에서 받은 영수증/);
  assert.match(html,/이 화면에서는 결제·구독해지·개인 계정 변경이 실행되지 않습니다/);
  assert.match(html,/input,textarea,select\{width:100%/);
  assert.match(html,/@media\(max-width:640px\)/);
  assert.doesNotMatch(html,/src="https:\/\/[^"]+\/ai-agency-admin/);
});
test('client settlement export escapes CSV formulas without storing operator key',async()=>{
  const js=await read('../ekodibiz/ai-agency-admin.js');
  assert.match(js,/const safeCell=value=>/);
  assert.match(js,/const clean=\/\^\[-=\+@\\t\\r\]/);
  assert.match(js,/\.replace\(\/"\/g,'""'\)/);
  assert.match(js,/text\/csv;charset=utf-8/);
  assert.match(js,/\/record-cycle/);
  assert.match(js,/\/stop-renewal/);
  assert.match(js,/\/settlement/);
  assert.doesNotMatch(js,/localStorage\.setItem\(['"]adminKey/);
  assert.doesNotMatch(js,/sessionStorage\.setItem\(['"]adminKey/);
});
