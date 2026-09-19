import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAgentVersion,
  chooseLiveWindowsAgent,
  evaluateVerification,
} from '../scripts/verify-device-agent-production.mjs';

test('parses the canonical Device Agent version marker',()=>{
  assert.equal(parseAgentVersion("$AgentVersion = '2.2.1'"), '2.2.1');
  assert.throws(()=>parseAgentVersion('Write-Host missing'));
});

test('selects the freshest online enrolled Windows PC only',()=>{
  const devices=[
    {id:'offline',status:'offline',platform:'windows',lastSeenAt:'2026-09-19T10:00:00Z',management:{source:'agent',type:'pc'}},
    {id:'inventory',status:'inventory',platform:'inventory',lastSeenAt:null,management:{source:'inventory',type:'pc'}},
    {id:'older',status:'online',platform:'windows',lastSeenAt:'2026-09-19T10:01:00Z',management:{source:'agent',type:'pc'}},
    {id:'newer',status:'online',platform:'Windows 11',lastSeenAt:'2026-09-19T10:02:00Z',management:{source:'agent',type:'pc'}},
  ];
  assert.equal(chooseLiveWindowsAgent(devices)?.id,'newer');
});

test('requires succeeded transactional update plus fresh heartbeat and online admin state',()=>{
  const base={
    status:'online',
    lastSeenAt:'2026-09-19T10:02:30Z',
    agentVersion:'2.2.0',
    recentCommands:[{
      id:'cmd_1',
      status:'succeeded',
      completedAt:'2026-09-19T10:02:20Z',
      result:{message:'EKODI Device Agent를 트랜잭션 방식으로 2.2.1 버전으로 업데이트했습니다.'},
    }],
  };
  const passed=evaluateVerification({device:base,commandId:'cmd_1',issuedAt:'2026-09-19T10:02:00Z',expectedVersion:'2.2.1'});
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.heartbeatAfterIssue,true);

  const stale=evaluateVerification({device:{...base,lastSeenAt:'2026-09-19T10:01:59Z'},commandId:'cmd_1',issuedAt:'2026-09-19T10:02:00Z',expectedVersion:'2.2.1'});
  assert.equal(stale.done,false);
  assert.equal(stale.reason,'heartbeat_not_fresh_yet');

  const failed=evaluateVerification({device:{...base,recentCommands:[{id:'cmd_1',status:'failed',result:{message:'[EKODI:EKA-170][heartbeat_verify] rollback'}}]},commandId:'cmd_1',issuedAt:'2026-09-19T10:02:00Z',expectedVersion:'2.2.1'});
  assert.equal(failed.ok,false);
  assert.match(failed.error,/EKA-170/);
});
