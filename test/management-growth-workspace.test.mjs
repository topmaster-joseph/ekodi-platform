import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MANAGEMENT_MODULES,entitlementPreview} from '../management-platform.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cfg=JSON.parse(read('config/management-platform.json'));
test('AI growth management is a selectable module for all management users',()=>{
  const module=MANAGEMENT_MODULES.find(x=>x.id==='growth');
  assert.ok(module);
  assert.equal(module.state,'foundation');
  assert.equal(cfg.modules.find(x=>x.id==='growth')?.dataPolicy,'verified-workspace-only');
  assert.deepEqual(entitlementPreview({tier:'free',selectedModuleIds:['growth']}).selectedModules,['growth']);
});
test('growth panel is member-only and scoped to verified selected workspace',()=>{
  const html=read('management/index.html'), app=read('management/app.js');
  assert.match(html,/<section id="memberApp"[^>]*hidden>/);
  const start=html.indexOf('id="memberApp"'), end=html.indexOf('</section>',html.indexOf('class="chief-card"'));
  assert.ok(start>=0&&end>start);
  assert.ok(html.slice(start,end).includes('id="growthManagement"'));
  assert.match(app,/function renderGrowthWorkspace\(\)/);
  assert.match(app,/const space=selectedVerifiedWorkspace\(\)/);
  assert.match(app,/if\(!space\)/);
  assert.match(app,/if\(!selected.has\('growth'\)\)/);
  assert.match(app,/const url=validSpaceUrl\(space.slug\)/);
  assert.match(app,/state.spaces.some\(item=>item.id===space.id/);
});
test('unknown search and sales metrics are not disguised as success',()=>{
  const app=read('management/app.js'), html=read('management/index.html');
  for(const label of ['공식 공급자 실측 자료 미연결','실제 게시·승인 이력 미연결','전환 추적 데이터 미연결','성과 자료 미연결'])
    assert.ok(app.includes(label));
  assert.match(html,/미연결·미확인은 0건이나 정상 운영을 의미하지 않습니다/);
  assert.match(html,/자동 게시와 비용 발생 작업은 여기서 실행하지 않습니다/);
  assert.ok(!app.includes("fetch('/api/control/search-visibility'"));
});
test('growth layout responds to 320-390px widths',()=>{
  const css=read('management/styles.css');
  assert.match(css,/\.growth-management/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
