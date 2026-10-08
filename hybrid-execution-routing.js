const WORKLOAD_PROFILES = Object.freeze({
  'system.diagnostics': Object.freeze({ taskType:'diagnostics.collect', capabilities:['diagnostics'] }),
  'system.status': Object.freeze({ taskType:'computer.system.read', capabilities:['computerRead'] }),
  'agent.status': Object.freeze({ taskType:'computer.agent.status', capabilities:['agentStatus'] }),
  'network.diagnostics': Object.freeze({ taskType:'network.diagnose', capabilities:['networkDiagnostics'] }),
  'browser.verify': Object.freeze({ taskType:'computer.browser.execute', capabilities:['backgroundBrowser'] }),
  'storage.cleanup': Object.freeze({ taskType:'maintenance.temp_cleanup', capabilities:['storageMaintenance'] }),
  'updates.scan': Object.freeze({ taskType:'updates.scan', capabilities:['windowsUpdate'] }),
});

const SERVICE_SCOPES = Object.freeze([
  'platform','seonammedi','board','ai','ekodichurch','ekodimall','ekodibiz','ekodibooks','ekodilive','cgma','cheonggye',
]);

function token(value, max = 80) {
  return String(value ?? '').trim().toLowerCase().slice(0, max);
}

export function normalizeServiceScope(value) {
  const scope = token(value || 'platform', 64);
  return SERVICE_SCOPES.includes(scope) ? scope : 'platform';
}

export function resolveHybridWorkload(body = {}) {
  const workloadClass = token(body.workloadClass, 80);
  if (!workloadClass) return null;
  const profile = WORKLOAD_PROFILES[workloadClass];
  if (!profile) return null;
  return Object.freeze({
    workloadClass,
    serviceScope:normalizeServiceScope(body.serviceScope),
    taskType:profile.taskType,
    requiredCapabilities:[...profile.capabilities],
  });
}

export function hybridWorkloadPolicySnapshot() {
  return Object.freeze({
    serviceScopes:[...SERVICE_SCOPES],
    workloadClasses:Object.keys(WORKLOAD_PROFILES),
    routing:'capability-first',
    stateAuthority:'cloud',
    workerTransport:'outbound-pull',
    arbitraryShell:false,
  });
}
