import test from 'node:test';
import assert from 'node:assert/strict';
import {selectUser2SafeRoute} from '../scripts/select-native-user2-safe-route.mjs';
const ready={targetAlias:'user2',heartbeatHealthy:true,capabilities:{backgroundBrowser:true,backgroundBrowserCanary:true},proofs:{browser:{verified:true,fresh:true,status:'succeeded'}}};
const gap={targetAlias:'user2',receiptStatus:'succeeded',backendReady:false,gapReason:'native-capability-not-production-ready'};
test('USER2 requires actual fresh native browser proof, never capability-only',()=>{
 const r=selectUser2SafeRoute({readiness:{...ready,proofs:{browser:{verified:false,fresh:true,status:'succeeded'}}},probe:gap});
 assert.equal(r.ok,false);assert.equal(r.sessionExecutionAuthorized,false);
});
test('USER2 native browser fallback never impersonates Hyper-V VM',()=>{
 const r=selectUser2SafeRoute({readiness:ready,probe:gap});
 assert.equal(r.ok,true);assert.equal(r.route,'ekodi-background-browser-worker');
 assert.equal(r.desktopBackendReady,false);assert.equal(r.sessionExecutionAuthorized,false);
 assert.ok(r.unsupportedTaskClasses.includes('isolated-desktop-execution'));
});
test('wrong device and stale heartbeat are blocked',()=>{
 assert.equal(selectUser2SafeRoute({readiness:{...ready,targetAlias:'user3'},probe:gap}).ok,false);
 assert.equal(selectUser2SafeRoute({readiness:{...ready,heartbeatHealthy:false},probe:gap}).ok,false);
});
test('ready Hyper-V backend is only a prerequisite, never full session authorization',()=>{
 const r=selectUser2SafeRoute({readiness:ready,probe:{targetAlias:'user2',receiptStatus:'succeeded',backendReady:true}});
 assert.equal(r.routeKind,'isolated-desktop-backend-ready');assert.equal(r.sessionExecutionAuthorized,false);
});
