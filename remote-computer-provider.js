export const REMOTE_COMPUTER_PROVIDER_ID = 'ekodi-native-remote-computer';

export const REMOTE_COMPUTER_TRANSITION_POLICY = Object.freeze({
  stage: 'external-bridge-until-native-verified',
  temporaryExternalProviderId: 'remote-desktop-commander',
  targetProviderId: REMOTE_COMPUTER_PROVIDER_ID,
  targetCostModel: 'self-hosted-no-third-party-per-call-fee',
  paidExternalAutoUpgrade: false,
  cutoverRequiresVerifiedNativeService: true,
  retireTemporaryBridgeAfterCutover: true,
});

export const REMOTE_COMPUTER_OPERATIONS = Object.freeze({
  'computer.system.read': Object.freeze({ capability:'computerRead', risk:'observe', hostMode:'allow', mutation:false }),
  'computer.process.list': Object.freeze({ capability:'processRead', risk:'observe', hostMode:'allow', mutation:false }),
  'computer.agent.status': Object.freeze({ capability:'agentStatus', risk:'observe', hostMode:'allow', mutation:false }),
  'computer.files.read': Object.freeze({ capability:'filesystemRead', risk:'observe', hostMode:'isolated-required', mutation:false }),
  'computer.files.write': Object.freeze({ capability:'filesystemWrite', risk:'maintain', hostMode:'isolated-required', mutation:true }),
  'computer.terminal.exec': Object.freeze({ capability:'isolatedCommand', risk:'maintain', hostMode:'isolated-required', mutation:true }),
  'computer.desktop.capture': Object.freeze({ capability:'desktopCapture', risk:'privileged', hostMode:'consent-required', mutation:false }),
  'computer.desktop.input': Object.freeze({ capability:'desktopInput', risk:'privileged', hostMode:'consent-required', mutation:true }),
});

const safeText = (value, max = 80) => String(value ?? '').trim().slice(0, max);

export function remoteComputerProviderDescriptor() {
  return Object.freeze({
    implementationId: REMOTE_COMPUTER_PROVIDER_ID,
    capabilityId: 'device.remote-computer',
    contractVersion: 'ekodi.capability-provider.v1',
    providerType: 'ekodi-responsible',
    nativeFirst: true,
    transitionStage: REMOTE_COMPUTER_TRANSITION_POLICY.stage,
    temporaryExternalProviderId: REMOTE_COMPUTER_TRANSITION_POLICY.temporaryExternalProviderId,
    targetCostModel: REMOTE_COMPUTER_TRANSITION_POLICY.targetCostModel,
    paidExternalAutoUpgrade: false,
    persistentAgentShell: false,
    directHostMutation: false,
    supportedOperations: Object.keys(REMOTE_COMPUTER_OPERATIONS),
    authorizationModel: 'device-plus-operation-scoped',
    dataHandling: 'purpose-bound-minimum',
    healthContract: 'device-heartbeat-plus-capability-projection',
    timeoutPolicy: 'bounded-lease-with-retry-and-failover',
    fallbackDeclaration: 'external-adapters-may-failover-only-with-equal-or-stronger-security',
  });
}

export function operationPolicy(operation) {
  return REMOTE_COMPUTER_OPERATIONS[safeText(operation, 64)] || null;
}

export function planRemoteComputerExecution({
  operation,
  native = null,
  externalProviders = [],
  isolatedExecutorVerified = false,
  localConsent = false,
  allowPaidExternal = false,
  externalFallbackAfterNativeCutover = false,
} = {}) {
  const policy = operationPolicy(operation);
  if (!policy) return Object.freeze({ ok:false, reason:'operation_not_allowed', candidates:[] });

  const candidates = [];
  const nativeCaps = native?.capabilities && typeof native.capabilities === 'object' ? native.capabilities : {};
  const nativeOnline = native?.state === 'online';
  const nativeServiceReady = native?.serviceReady === true;
  const nativeCapability = nativeCaps[policy.capability] === true;
  const nativeSecurityReady =
    policy.hostMode === 'allow'
    || (policy.hostMode === 'isolated-required' && isolatedExecutorVerified === true)
    || (policy.hostMode === 'consent-required' && localConsent === true && isolatedExecutorVerified === true);

  if (nativeServiceReady && nativeOnline && nativeCapability && nativeSecurityReady) {
    candidates.push(Object.freeze({
      providerId: REMOTE_COMPUTER_PROVIDER_ID,
      kind: 'native',
      operation,
      risk: policy.risk,
      securityMode: policy.hostMode,
      costModel: REMOTE_COMPUTER_TRANSITION_POLICY.targetCostModel,
    }));
  }

  for (const item of Array.isArray(externalProviders) ? externalProviders : []) {
    if (!item || item.state !== 'online' || item.securityEquivalent !== true) continue;
    const operations = Array.isArray(item.operations) ? item.operations : [];
    if (!operations.includes(operation)) continue;

    const providerId = safeText(item.id, 80);
    const paidOnly = item.requiresPaidUpgrade === true || safeText(item.costModel, 40) === 'paid-only';
    if (paidOnly && allowPaidExternal !== true) continue;
    if (item.quotaAvailable === false) continue;

    const isTemporaryBridge =
      item.temporaryBridge === true
      || providerId === REMOTE_COMPUTER_TRANSITION_POLICY.temporaryExternalProviderId;

    if (
      nativeServiceReady
      && isTemporaryBridge
      && externalFallbackAfterNativeCutover !== true
      && REMOTE_COMPUTER_TRANSITION_POLICY.retireTemporaryBridgeAfterCutover
    ) {
      continue;
    }

    candidates.push(Object.freeze({
      providerId,
      kind: 'external-adapter',
      operation,
      risk: policy.risk,
      securityMode: safeText(item.securityMode || 'equivalent', 40),
      temporaryBridge: isTemporaryBridge,
      costModel: safeText(item.costModel || 'external-provider', 40),
    }));
  }

  const transitionStage = nativeServiceReady ? 'native-cutover' : 'external-bridge';
  return Object.freeze({
    ok: candidates.length > 0,
    reason: candidates.length ? 'candidate_ready' : 'no_compliant_provider',
    nativePreferred: candidates[0]?.providerId === REMOTE_COMPUTER_PROVIDER_ID,
    transitionStage,
    nativeServiceReady,
    paidExternalAutoUpgrade: false,
    policy,
    candidates,
  });
}

export function validateRemoteComputerReceipt(receipt = {}) {
  const errors = [];
  if (!safeText(receipt.requestId, 120)) errors.push('request_id_required');
  if (!safeText(receipt.deviceId, 120)) errors.push('device_id_required');
  if (!operationPolicy(receipt.operation)) errors.push('operation_invalid');
  if (!['ok','partial','unavailable','rejected','error'].includes(receipt.status)) errors.push('status_invalid');
  if (receipt.authorityExpanded === true) errors.push('authority_expansion_forbidden');
  if (receipt.reusableCredentialExposed === true) errors.push('credential_exposure_forbidden');
  if (receipt.directProductionMutation === true) errors.push('direct_production_mutation_forbidden');
  return Object.freeze({ ok:errors.length === 0, errors });
}
