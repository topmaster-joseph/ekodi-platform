import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getExperienceCatalog } from '../experience-catalog.js';
import { getExperienceScenario } from '../experience/scenarios.js';

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8').replace(/^\uFEFF/,'');

test('3단계 서비스 선택 뒤 실제 가상 시나리오가 여러 장면으로 진행된다',()=>{
  const catalog=getExperienceCatalog();
  for(const service of catalog.services){
    const persona=catalog.personas.find(item=>service.personas.includes(item.id));
    const scenario=getExperienceScenario(service,persona);
    assert.ok(scenario.steps.length>=3,`${service.id} needs at least 3 scenario steps`);
    for(const item of scenario.steps){
      assert.ok(item.options.length>=3,`${service.id}:${item.title} needs choices`);
      assert.equal(typeof item.result,'function');
      assert.ok(item.result(item.options[0]).length>0);
    }
    assert.ok(scenario.finish.length>0);
  }
});

test('사용자모드 서비스 선택은 몰입형 체험공간과 진행 엔진으로 이어진다',()=>{
  const app=read('experience/app.js');
  assert.match(app,/selectService\(service\.id,true\)/);
  assert.match(app,/defaultRoomForService/);
  assert.match(app,/advanceRoomScenario/);
  assert.match(app,/가상 AI가 다음 장면을 구성하고 있습니다/);
  assert.match(app,/MISSION COMPLETE · SYNTHETIC ONLY/);
  assert.match(app,/실제 저장·결제·게시·메시지는 발생하지 않았습니다/);
});