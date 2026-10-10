import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeNativeDeviceReadiness,summarizeNativeDeviceReadiness} from '../scripts/observe-native-device-readiness.mjs';

const now=Date.parse('2026-10-10T14:00:00.000Z');
const online={hostname:'USER3',platform:'Windows 11',management:{source:'agent',type:'pc'},
  revokedAt:null,status:'online',lastSeenAt:new Date(now-12000).toISOString(),
  capabilities:{backgroundBrowser:true,isolatedDesktop:false,localAI:false},
  id:'do-not-expose-device-id',deviceToken:'do-not-expose-token'};
test('native observer verifies only a recent enrolled agent heartbeat and publishes no identifiers',()=>{
  const a=summarizeNativeDeviceReadiness([online],{now,hostname:'user3'});
  assert.equal(a.registered,true);
  assert.equal(a.heartbeatHealthy,true);
  assert.equal(a.capabilities.backgroundBrowser,true);
  assert.equal(a.capabilities.isolatedDesktop,false);
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
