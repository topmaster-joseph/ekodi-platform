import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('control.html'),css=read('control.css'),js=read('control.js');

test('top transcript and bottom command are separate, stable rows with one scroll owner',()=>{
 assert.match(html,/class="chat-workspace-head"/);
 assert.match(html,/id="workspaceCounts"/);
 assert.match(html,/id="openTaskList"/);
 assert.match(html,/class="conversation" id="conversation" aria-label="명령 대화 기록" tabindex="0"/);
 assert.match(html,/class="composer-wrap"/);
 assert.ok(html.indexOf('id="workspaceCounts"')<html.indexOf('id="conversation"'));
 assert.ok(html.indexOf('id="conversation"')<html.indexOf('id="commandForm"'));
 assert.match(css,/CONTROL-SPLIT-002/);
 assert.match(css,/grid-template-rows:auto minmax\(0,1fr\) auto!important/);
 assert.match(css,/position:relative!important;left:0!important;right:auto!important;bottom:auto!important/);
 assert.match(css,/border-top:1px solid #cfd8e2!important/);
 assert.match(css,/\.control-main \.conversation\{[\s\S]*?overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.doesNotMatch(js,/window\.scrollTo\(/);
 assert.doesNotMatch(js,/scrollIntoView\(/);
});

test('current task counts include Human Gate blockers but do not invent approvals',()=>{
 const start=js.indexOf('  function renderWorkspaceSummary(){');
 const end=js.indexOf('  function renderRecent(){',start);
 assert.ok(start>=0&&end>start);
 const node={textContent:''};
 const state={sessions:[{id:'s1'},{id:'s2'}],tasks:[{status:'blocked'},{status:'verified'},{status:'human_gate'}]};
 const checkboxes={orchestratorRelease:{checked:false},executeNow:{checked:true}};
 const description={textContent:''};
 const context={state,$:selector=>selector==='#workspaceCounts'?node:selector==='#executionModeDescription'?description:checkboxes[selector.slice(1)]||null};
 const funcs=vm.runInNewContext(js.slice(start,end)+'\n({renderWorkspaceSummary,updateExecutionMode})',context);
 funcs.renderWorkspaceSummary();
 assert.equal(node.textContent,'이 브라우저 대화 2건 · 작업 3건 · 차단 기록 2건');
 state.tasks=[{status:'verified'}];funcs.renderWorkspaceSummary();
 assert.equal(node.textContent,'이 브라우저 대화 2건 · 작업 1건');
});

test('execution description distinguishes ordinary command, response-only and protected Human Gate',()=>{
 const start=js.indexOf('  function renderWorkspaceSummary(){');
 const end=js.indexOf('  function renderRecent(){',start);
 const label={textContent:''},boxes={executeNow:{checked:true},orchestratorRelease:{checked:false}};
 const context={state:{sessions:[],tasks:[]},$:selector=>selector==='#executionModeDescription'?label:boxes[selector.slice(1)]||null};
 const update=vm.runInNewContext(js.slice(start,end)+'\nupdateExecutionMode',context);
 update();assert.match(label.textContent,/일반 실행/);
 boxes.executeNow.checked=false;update();assert.match(label.textContent,/응답만 요청/);
 boxes.orchestratorRelease.checked=true;update();
 assert.match(label.textContent,/즉시 배포하지 않고/);
 assert.match(label.textContent,/공식 오케스트레이터/);
 assert.match(html,/id="orchestratorRelease" aria-describedby="executionModeDescription"/);
 assert.match(html,/id="executeNow" checked aria-describedby="executionModeDescription"/);
 assert.match(js,/idempotencyKey/);
 assert.match(js,/\/api\/control\/ai\/v8\/orchestrator\/submit/);
 assert.match(js,/\/api\/control\/ai\/v8\/pulse/);
 assert.match(js,/id:'control-'/);
 assert.match(js,/renderWorkspaceSummary\(\)/);
});

test('existing Admin single sidebar and stored conversations remain unchanged',()=>{
 const home=read('admin-control-home.js');
 assert.match(home,/frame\.src='\/control\?embedded=admin'/);
 assert.match(js,/function mountEmbeddedToolbar\(\)/);
 assert.match(js,/rail\.hidden=true/);
 assert.match(js,/HISTORY_KEY='ekodi-admin-command-history-v1'/);
 assert.match(js,/CONTROL_STATE='ekodi-control-state-v1'/);
 assert.match(js,/TOKEN_KEY='ekodi-auth-token'/);
 assert.match(html,/href="\/admin\/control"/);
 assert.match(html,/id="newTask"/);
 assert.match(html,/data-view="tasks"/);
 assert.match(html,/data-view="results"/);
});
