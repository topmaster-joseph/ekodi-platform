import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeNativeDeviceReadiness,observeNativeDeviceReadinessFleet,summarizeNativeDeviceReadiness} from '../scripts/observe-native-device-readiness.mjs';

const now=Date.parse('2026-10-10T14:00:00.000Z');
const online={hostname:'USER3',platform:'Windows 11',management:{source:'agent',type:'pc'},
  revokedAt:null,status:'online',lastSeenAt:new Date(now-12000).toISOString(),
  capabilities:{backgroundBrowser:true,backgroundBrowserCanary:true,isolatedDesktop:false,isolatedDesktopProbe:true,agentStatus:true,localAiInstall:true},
  id:'do-not-expose-device-id',deviceToken:'do-not-expose-token'};
test('native observer verifies only a recent enrolled agent heartbeat and publishes no identifiers',()=>{
  const a=summarizeNativeDeviceReadiness([online],{now,hostname:'user3'});
  assert.equal(a.registered,true);
  assert.equal(a.heartbeatHealthy,true);
  assert.equal(a.capabilities.backgroundBrowser,true);
  assert.equal(a.capabilities.isolatedDesktop,false);
  assert.equal(a.capabilities.agentStatus,true);
  assert.equal(a.capabilities.localAiInstall,true);
  assert.equal(a.capabilities.isolatedDesktopProbe,true);
  assert.equal(a.capabilities.backgroundBrowserCanary,true);
  assert.equal('localAI' in a.capabilities,false,'unsupported legacy alias must not be projected');
  assert.equal(a.nativeCutoverVerified,false);
  assert.equal(a.remoteCommandIssued,false);
  assert.doesNotMatch(JSON.stringify(a),/do-not-expose/);
});
test('Desktop Commander connectivity and other hostnames never count as native agent',()=>{
  const external={...online,management:{source:'desktop-commander',type:'pc'}};
  const other={...online,hostname:'user30'};
  const a=summarizeNativeDeviceReadiness([external,other],{now,hostname:'user3'});
  assert.equal(a.registered,false);
  assert.equal(a.heartbeatHealthy,false);
  assert.equal(a.verificationState,'NATIVE_AGENT_NOT_REGISTERED');
});
test('a stale or revoked native agent never claims to be online',()=>{
  const stale={...online,lastSeenAt:new Date(now-90001).toISOString()};
  assert.equal(summarizeNativeDeviceReadiness([stale],{now}).heartbeatHealthy,false);
  assert.equal(summarizeNativeDeviceReadiness([{...online,revokedAt:'2026-10-10T12:00:00Z'}],{now}).registered,false);
});
test('live observation uses only authenticated GET and never submits commands',async()=>{
  const calls=[];
  const fakeFetch=async(url,init)=>{
    calls.push({url,init});
    return new Response(JSON.stringify({devices:[online]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const a=await observeNativeDeviceReadiness({token:'temporary-session-token-long-enough',hostname:'user3',now,fetchImpl:fakeFetch});
  assert.equal(a.heartbeatHealthy,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://ekodi.kr/api/control/devices/readiness?hostname=user3');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.headers.authorization,'Bearer temporary-session-token-long-enough');
});
test('missing administrator session is rejected before any API request',async()=>{
  let n=0;
  await assert.rejects(observeNativeDeviceReadiness({token:'',fetchImpl:async()=>{n++;}}),/trusted_admin_session_required/);
  assert.equal(n,0);
});

test('scheduled native heartbeat checks cannot run mutating canaries without release receipt',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
  assert.match(workflow,/Observe production native PC Agent heartbeat without issuing commands/);
  assert.match(workflow,/github.event_name != 'workflow_dispatch' \|\| inputs.execution_mode != 'verify'/);
  assert.match(workflow,/Verify native browser through bounded isolated session stages/);
  assert.match(workflow,/github.event_name == 'workflow_dispatch' && inputs.execution_mode == 'verify'/);
  assert.match(workflow,/test -n "\$EKODI_RELEASE_BRANCH_REF"/);
  assert.match(workflow,/test -n "\$EKODI_RELEASE_TASK_ID"/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration.mjs" --release/);
  assert.match(workflow,/Revoke short-lived verification session/);
});

test('production native heartbeat endpoint is an authenticated SELECT-only snapshot',()=>{
  const source=readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
  const begin=source.indexOf("if (request.method === 'GET' && path === `\${ADMIN_PREFIX}/readiness`)");
  const end=source.indexOf("if (request.method === 'GET' && path === ADMIN_PREFIX)",begin);
  assert.ok(begin>0 && end>begin,'readiness route must precede the job-reconciling admin list route');
  const route=source.slice(begin,end);
  assert.match(route,/SELECT r.hostname, r.platform, r.last_seen_at/);
  assert.match(route,/r.revoked_at IS NULL/);
  assert.match(route,/WHERE LOWER\(r.hostname\) = \?/);
  assert.match(route,/mode:'observe-only'/);
  assert.doesNotMatch(route,/reconcileJobs|UPDATE\s+|INSERT\s+|DELETE\s+|\.run\(|\.batch\(|\.first\(/i);
  assert.doesNotMatch(route,/token_hash|command_type|issued_by|device_id:/i);
  assert.match(source.slice(end,end+145),/reconcileJobs\(env\)/);
});
test('untrusted hostnames are blocked before querying production API',async()=>{
  let count=0;
  await assert.rejects(observeNativeDeviceReadiness({
    token:'trusted-admin-session-long-enough',
    hostname:'user3/../../../',
    fetchImpl:async()=>{count++;throw new Error('should not be called');}
  }),/invalid_target_hostname/);
  assert.equal(count,0);
});

test('read-only heartbeat route skips schema DDL and command-queue reconciliation',()=>{
  const source=readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
  const start=source.indexOf('export async function handleDeviceControl(');
  const route=source.slice(start,start+850);
  const bypass=route.indexOf("path === `\${ADMIN_PREFIX}/readiness`");
  const schema=route.indexOf('await ensureSchema(env.DB)');
  assert.ok(bypass>0 && schema>bypass,'read-only query must return before schema initialization');
  assert.match(route,/return handleAdmin\(request, env\)/);
});

test('native capability projection uses actual Windows Agent heartbeat field names',()=>{
  const api=readFileSync(new URL('../device-control.js',import.meta.url),'utf8');
  const agent=readFileSync(new URL('../tools/ekodi-device-agent/windows/ekodi-device-agent.ps1',import.meta.url),'utf8');
  for(const key of ['localAiInstall','agentStatus','backgroundBrowserCanary','isolatedDesktopProbe']){
    assert.ok(agent.includes(key+' = '),'Windows heartbeat declares '+key);
    assert.ok(api.includes(key+': capabilities.'+key+' === true'),'sanitized API projects '+key);
  }
  const readiness=api.slice(api.indexOf("path === `\${ADMIN_PREFIX}/readiness`)"),api.indexOf("if (request.method === 'GET' && path === ADMIN_PREFIX)"));
  assert.ok(!readiness.includes('localAI: capabilities.localAI'),'legacy localAI field must not appear');
});

test('post-production Control API completion triggers only safe native heartbeat observation',()=>{
  const w=readFileSync(new URL('../.github/workflows/device-agent-production-verification.yml',import.meta.url),'utf8');
  assert.ok(w.includes('workflow_run:\n    workflows: [Deploy Control API]\n    types: [completed]'));
  const head=w.slice(w.indexOf('  real-device:'),w.indexOf('  real-device:')+900);
  for(const marker of [
    "github.ref == 'refs/heads/main'",
    "github.event_name == 'workflow_run'",
    "github.event.workflow_run.event == 'workflow_dispatch'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.conclusion == 'success'"
  ]) assert.ok(head.includes(marker),'Missing provenance restriction: '+marker);
  assert.ok(w.includes("if: github.event_name != 'workflow_dispatch' || inputs.execution_mode != 'verify'"));
  assert.ok(w.includes("if: github.event_name == 'workflow_dispatch' && inputs.execution_mode == 'verify'"));
  assert.ok(w.includes('node scripts/observe-native-device-readiness.mjs'));
  assert.ok(w.includes('test -n "$EKODI_RELEASE_BRANCH_REF"'));
  assert.ok(w.includes('test -n "$EKODI_RELEASE_TASK_ID"'));
});

test('scheduled read-only fleet observation independently classifies USER4 rather than replacing it with USER3',async()=>{
  const requests=[];
  const fetchImpl=async(url,init)=>{
    requests.push({url,method:init.method});
    const target=new URL(url).searchParams.get('hostname');
    const devices=target==='user3'?[online]:[
      {...online,hostname:'USER4',status:'offline',lastSeenAt:new Date(now-600000).toISOString()}
    ];
    return new Response(JSON.stringify({devices}),{status:200});
  };
  const fleet=await observeNativeDeviceReadinessFleet({
    token:'temporary-session-token-long-enough',
    hostnames:['user3','user4'],now,fetchImpl
  });
  assert.equal(fleet.targets[0].heartbeatHealthy,true);
  assert.equal(fleet.targets[1].targetAlias,'user4');
  assert.equal(fleet.targets[1].heartbeatHealthy,false);
  assert.equal(fleet.targets[1].verificationState,'NATIVE_AGENT_REGISTERED_NOT_ONLINE');
  assert.equal(fleet.remoteCommandIssued,false);
  assert.deepEqual(requests.map(x=>x.method),['GET','GET']);
  assert.equal(requests[1].url,'https://ekodi.kr/api/control/devices/readiness?hostname=user4');
  assert.doesNotMatch(JSON.stringify(fleet),/do-not-expose/);
});
test('USER4 readiness failure is explicit; healthy USER3 never substitutes its proof',async()=>{
  const fetchImpl=async(url)=>{
    if(new URL(url).searchParams.get('hostname')==='user4')return new Response('{}',{status:503});
    return new Response(JSON.stringify({devices:[online]}),{status:200});
  };
  const fleet=await observeNativeDeviceReadinessFleet({
    token:'temporary-session-token-long-enough',now,fetchImpl
  });
  assert.equal(fleet.targets[0].heartbeatHealthy,true);
  assert.equal(fleet.targets[1].heartbeatHealthy,false);
  assert.equal(fleet.targets[1].verificationState,'NATIVE_AGENT_OBSERVATION_UNAVAILABLE');
  assert.equal(fleet.targets[1].remoteCommandIssued,false);
});
test('fleet observation fails closed for untrusted token or duplicated/invalid target',async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;throw Error('unexpected');};
  await assert.rejects(()=>observeNativeDeviceReadinessFleet({token:'',fetchImpl}),/trusted_admin_session_required/);
  await assert.rejects(()=>observeNativeDeviceReadinessFleet({
    token:'temporary-session-token-long-enough',hostnames:['user3','user3'],fetchImpl
  }),/invalid_fleet_targets/);
  assert.equal(called,0);
});
