import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../office-prototype/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../office-prototype/office.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../office-prototype/office.js', import.meta.url), 'utf8');
const kinds = ['meeting','proposal','education'];
const targets = ['https://ekodi.kr/my/docs/','https://ekodi.kr/my/approvals/','https://ekodi.kr/proposal/','https://ekodi.kr/edu/','https://ekodi.kr/my/'];

test('each workflow is a real, accessible route-specific guide, not a made-up automation', () => {
  assert.match(html,/id="flows"/);
  assert.match(html,/href="#flows"/);
  for(const kind of kinds){
    assert.match(html,new RegExp('data-flow="'+kind+'"'));
    assert.match(html,new RegExp('id="flow-panel-'+kind+'"'));
    assert.match(html,new RegExp('data-flow-template="'+kind+'"'));
    assert.match(html,new RegExp('data-flow-copy="'+kind+'"'));
    assert.match(html,new RegExp('id="flow-tab-'+kind+'"'));
    assert.match(html,new RegExp('aria-controls="flow-panel-'+kind+'"'));
    assert.match(html,new RegExp('aria-labelledby="flow-tab-'+kind+'"'));
  }
  for(const route of targets)assert.ok(html.includes('href="'+route+'"'),route);
  assert.match(html,/실제 실행 경계/);
  assert.match(html,/결재 요청 생성, 일정 등록, 문서 자동 저장 또는 대외 발송을 수행하지 않습니다/);
  assert.match(html,/기관 AI·개인 AI의 결과를 다시 생성하지 않습니다/);
});

test('workflow templates are static, editable outside this page, never uploaded or collected',()=>{
  assert.equal((html.match(/<pre class="flow-template"/g)||[]).length,3);
  assert.equal((html.match(/class="flow-copy"/g)||[]).length,3);
  assert.doesNotMatch(html,/<form\b|<input\b|<textarea\b|<iframe\b|<object\b|<embed\b/);
  assert.doesNotMatch(html,/외부 기관 AI 자동 연결 완료|자동 결재|일정 등록 완료/);
  assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon|postMessage|document\.cookie)\b/);
  assert.doesNotMatch(source,/innerHTML|eval\s*\(|new Function/);
  assert.match(source,/navigator\.clipboard\.writeText\(content\)/);
  assert.match(css,/\.flow-layout/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
});

function harness({canCopy=true,rejectCopy=false}={}){
  const controls={};
  const calls=[];
  const panels={};
  const templates={
    meeting:'[회의 후속 업무 인계]\n회의명 / 일시:',
    proposal:'[제안서·견적 검토 인계]\n제안명:',
    education:'[교육 운영·결과 보고 인계]\n교육명:',
  };
  const makeTab=(kind,id)=>({
    dataset:{[kind]:id},
    attributes:{},
    tabIndex:id==='meeting'||id==='personal'?0:-1,
    handlers:{},
    setAttribute(name,value){this.attributes[name]=value;},
    addEventListener(name,fn){this.handlers[name]=fn;},
    focus(){this.focused=true;},
  });
  const originalTabs=['personal','team','desktop'].map(x=>makeTab('tab',x));
  const workflowTabs=kinds.map(x=>makeTab('flow',x));
  for(const name of kinds){
    panels['flow-panel-'+name]={
      hidden:name!=='meeting',
      querySelector(selector){
        return selector==='[data-flow-template="'+name+'"]'?{textContent:templates[name]}:null;
      }
    };
  }
  for(const name of ['personal','team','desktop']) panels['panel-'+name]={hidden:name!=='personal'};
  const buttons=kinds.map(id=>({
    dataset:{flowCopy:id},
    handlers:{},
    addEventListener(event,callback){this.handlers[event]=callback;},
  }));
  const status={textContent:''};
  const document={
    querySelectorAll(q){
      if(q==='[role="tab"][data-tab]')return originalTabs;
      if(q==='[role="tab"][data-flow]')return workflowTabs;
      if(q==='[data-flow-copy]')return buttons;
      return [];
    },
    getElementById(id){return id==='flow-copy-status'?status:panels[id]||null;},
  };
  const window={
    location:{hash:''},
    history:{replaceState(){}},
    addEventListener(){},
  };
  const navigator=canCopy?{clipboard:{async writeText(content){if(rejectCopy)throw Error('denied');calls.push(content)}}}:{};
  runInNewContext(source,{document,window,navigator});
  return{workflowTabs,originalTabs,buttons,panels,status,calls};
}
test('real UI events switch workflows without changing the user route, and copy only visible template',async()=>{
  const h=harness();
  assert.equal(h.workflowTabs[0].attributes['aria-selected'],undefined);
  h.workflowTabs[1].handlers.click();
  assert.equal(h.workflowTabs[1].attributes['aria-selected'],'true');
  assert.equal(h.workflowTabs[0].tabIndex,-1);
  assert.equal(h.panels['flow-panel-meeting'].hidden,true);
  assert.equal(h.panels['flow-panel-proposal'].hidden,false);
  await h.buttons[0].handlers.click();
  assert.equal(h.calls.length,0,'hidden templates cannot be copied from stale controls');
  await h.buttons[1].handlers.click();
  assert.deepEqual(h.calls,['[제안서·견적 검토 인계]\n제안명:']);
  assert.match(h.status.textContent,/복사했습니다/);
  let prevented=false;
  h.workflowTabs[1].handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true}});
  assert.equal(prevented,true);
  assert.equal(h.workflowTabs[2].focused,true);
  assert.equal(h.panels['flow-panel-education'].hidden,false);
  h.workflowTabs[2].handlers.keydown({key:'Home',preventDefault(){}});
  assert.equal(h.panels['flow-panel-meeting'].hidden,false);
  h.workflowTabs[0].handlers.keydown({key:'End',preventDefault(){}});
  assert.equal(h.panels['flow-panel-education'].hidden,false);
});
test('clipboard denial and unsupported environment provide safe manual copying',async()=>{
  const unavailable=harness({canCopy:false});
  await unavailable.buttons[0].handlers.click();
  assert.equal(unavailable.calls.length,0);
  assert.match(unavailable.status.textContent,/직접 선택해 복사/);
  const denied=harness({rejectCopy:true});
  await denied.buttons[0].handlers.click();
  assert.equal(denied.calls.length,0);
  assert.match(denied.status.textContent,/복사 권한이 허용되지 않았습니다/);
});
