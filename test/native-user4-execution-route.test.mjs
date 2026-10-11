import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUser4ExecutionRoute } from '../scripts/select-native-user4-execution-route.mjs';

const healthyBrowser={
  heartbeatHealthy:true,
  capabilities:{backgroundBrowser:true,backgroundBrowserCanary:true},
  proofs:{browser:{verified:true,fresh:true,status:'succeeded'}},
};

test('USER4 uses EKODI background browser for browser-safe work when Hyper-V is not ready',()=>{
  const result=selectUser4ExecutionRoute({
    readiness:healthyBrowser,
    probe:{backendReady:false,gapReason:'native-capability-not-production-ready'},
  });
  assert.equal(result.ok,true);
  assert.equal(result.route,'ekodi-background-browser-worker');
  assert.equal(result.routeKind,'non-disruptive-browser-alternative');
  assert.equal(result.desktopBackendReady,false);
  assert.equal(result.browserAlternativeReady,true);
  assert.equal(result.externalProviderUsed,false);
  assert.equal(result.fallback,false);
  assert.ok(result.supportedTaskClasses.includes('isolated-browser-execution'));
  assert.ok(result.unsupportedTaskClasses.includes('isolated-desktop-execution'));
});

test('USER4 keeps native isolated desktop route only when Hyper-V backend is actually ready',()=>{
  const result=selectUser4ExecutionRoute({
    readiness:healthyBrowser,
    probe:{backendReady:true},
  });
  assert.equal(result.route,'ekodi-native-remote-computer');
  assert.equal(result.routeKind,'isolated-desktop');
  assert.equal(result.desktopBackendReady,true);
});

test('USER4 fails closed when neither Hyper-V nor verified background browser is ready',()=>{
  assert.throws(()=>selectUser4ExecutionRoute({
    readiness:{heartbeatHealthy:true,capabilities:{backgroundBrowser:false,backgroundBrowserCanary:false},proofs:{}},
    probe:{backendReady:false,gapReason:'native-capability-not-production-ready'},
  }),/user4_no_safe_native_execution_route/);
});
