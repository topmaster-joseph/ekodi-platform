import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const agent = readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1', import.meta.url), 'utf8');
const control = readFileSync(new URL('../device-control.js', import.meta.url), 'utf8');

function sanitizedStatus(result) {
  const start = control.indexOf('function summarizeCommandResult(');
  const end = control.indexOf('\nfunction ', start + 5);
  assert.ok(start >= 0 && end > start);
  const isolated = {safeText: (v,n=120) => String(v??'').slice(0,n)};
  vm.runInNewContext(control.slice(start,end) + '\nthis.projection = summarizeCommandResult;', isolated);
  return JSON.parse(JSON.stringify(isolated.projection(result,'computer.agent.status')));
}

test('USER4 task posture reads only fixed EKODI scheduled tasks without any mutation', () => {
  const start=agent.indexOf('function Get-EkodiConsoleTaskPosture {');
  const end=agent.indexOf('function Get-RemoteAgentStatus {',start);
  assert.ok(start >= 0 && end > start);
  const block=agent.slice(start,end);
  for(const task of ['EKODI Device Agent','EKODI Remote Agent Watchdog','EKODI Remote Agent Watchdog Monitor','EKODI POS Agent']){
    assert.ok(block.includes(task),task);
  }
  assert.match(block,/Get-ScheduledTask -TaskPath/);
  assert.match(block,/Get-ScheduledTaskInfo -TaskPath/);
  assert.match(block,/\-WindowStyle/);
  assert.match(block,/\-NonInteractive/);
  assert.doesNotMatch(block,/\b(?:Register-ScheduledTask|Unregister-ScheduledTask|Set-ScheduledTask|Start-ScheduledTask|Stop-ScheduledTask|Start-Process|Stop-Process|Invoke-Expression)\b/);
  assert.match(agent,/consoleTaskPosture = Get-EkodiConsoleTaskPosture/);
});

test('agent status reply strips unapproved tasks, raw commands and principals', () => {
  const data=sanitizedStatus({agent:{
    checkedAt:'2026-10-18T00:00:00Z',
    consoleTaskPosture:{mode:'read-only',checkedAt:'2026-10-18T00:00:00Z',tasks:[
      {name:'EKODI Device Agent',installed:true,state:'Ready',powerShellAction:true,
        hiddenFlag:true,nonInteractiveFlag:false,interactivePrincipal:true,systemPrincipal:false,
        lastRunUtc:'2026-10-18T00:00:00Z',lastResult:0,actionCount:1,queryStatus:'ok',
        arguments:'-File C:\\Users\\someone\\secret.ps1',principalUserId:'admin@example.test',
        rawCommandLine:'private'},
      {name:'Unrelated Admin Task',installed:true,commandLine:'secret'},
    ]}
  }});
  assert.equal(data.agent.consoleTaskPosture.mode,'read-only');
  assert.equal(data.agent.consoleTaskPosture.tasks.length,1);
  assert.equal(data.agent.consoleTaskPosture.tasks[0].name,'EKODI Device Agent');
  assert.equal(data.agent.consoleTaskPosture.tasks[0].interactivePrincipal,true);
  for(const secret of ['secret.ps1','admin@example.test','rawCommandLine','Unrelated Admin Task']){
    assert.ok(!JSON.stringify(data).includes(secret),secret);
  }
});

test('unknown posture names and states fail closed', () => {
  const a=sanitizedStatus({agent:{consoleTaskPosture:{mode:'read-only',tasks:[
    {name:'EKODI POS Agent',state:'malicious_state',queryStatus:'secrets',
      actionCount:9000,lastResult:1e99,powerShellAction:'true'},
  ]}}});
  const t=a.agent.consoleTaskPosture.tasks[0];
  assert.equal(t.state,'unknown');
  assert.equal(t.queryStatus,'unknown');
  assert.equal(t.actionCount,8);
  assert.equal(t.lastResult,null);
  assert.equal(t.powerShellAction,false);
});
