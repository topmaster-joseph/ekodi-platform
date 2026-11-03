import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recommendModelFamily } from '../ai-router-score.js';

const loadVerdict=async()=>{
  const js=await readFile(new URL('../admin-assist-dock.js',import.meta.url),'utf8');
  const m=js.match(/\/\*AI-ROUTE-FAMILY-001:start\*\/([\s\S]*?)\/\*AI-ROUTE-FAMILY-001:end\*\//);
  assert.ok(m,'advisory block markers present');
  return new Function(`${m[1]};return familyVerdict;`)();
};

test('dock advisory verdict matches the server router family for every sample',async()=>{
  const familyVerdict=await loadVerdict();
  const samples=['청계면상인회 포스터 이미지 생성해줘','행사 슬로건 아이디어 브레인스토밍','저장소 코드 디버그하고 테스트','주보 문서 초안 작성','지역 상권 통계 분석','로고 그림 만들어줘','안녕하세요','fix the repo and deploy','draft an email',''];
  for(const prompt of samples){
    assert.equal(familyVerdict(prompt).family,recommendModelFamily({prompt}).family,prompt);
  }
});

test('dock shows the verdict on user turns only and stays advisory',async()=>{
  const js=await readFile(new URL('../admin-assist-dock.js',import.meta.url),'utf8');
  assert.match(js,/advisory:familyVerdict\(value\)/);
  assert.match(js,/message\.role==='user'&&message\.advisory\?\.label/);
  const familyVerdict=await loadVerdict();
  assert.deepEqual(familyVerdict('포스터 이미지'),{family:'chatgpt',label:'GPT 적합',reason:'이미지 생성'});
  assert.equal(familyVerdict(null).family,'claude');
});
