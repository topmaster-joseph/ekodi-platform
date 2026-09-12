const protectedCategories = new Set([
  'medical',
  'refrigeration',
  'fire_safety',
  'security',
  'network_core',
  'electrical_safety'
]);

export const DEFAULT_POLICY = Object.freeze({
  mode: 'advisory',
  anomalyMultiplier: 1.7,
  anomalyMinDeltaW: 300,
  standbyThresholdW: 10,
  deviceExpectedMaxRatio: 1.25,
  autonomousActions: [
    'telemetry.read',
    'analysis.anomaly',
    'recommendation.create'
  ],
  humanGateActions: [
    'device.power_off',
    'device.power_on',
    'thermostat.set',
    'schedule.change'
  ],
  forbiddenActions: [
    'main_breaker.toggle',
    'rcd.disable',
    'safety_alarm.disable',
    'medical_device.power_off',
    'unknown_device.execute'
  ]
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isProtected(device = {}) {
  return Boolean(device.critical) || protectedCategories.has(String(device.category || '').toLowerCase());
}

function estimateMonthlySavingsWon(device = {}, pricePerKwh) {
  const powerW = finiteNumber(device.powerW);
  const idleHoursPerDay = finiteNumber(device.idleHoursPerDay);
  const price = finiteNumber(pricePerKwh);
  if (powerW === null || idleHoursPerDay === null || price === null) return null;
  if (powerW <= 0 || idleHoursPerDay <= 0 || price <= 0) return null;
  return Math.round((powerW / 1000) * idleHoursPerDay * 30 * price);
}

function recommendation({ code, severity, title, detail, target = 'home', proposedAction = null, humanGate = false, estimatedMonthlySavingsWon = null }) {
  return {
    code,
    severity,
    title,
    detail,
    target,
    proposedAction,
    humanGate,
    executable: false,
    estimatedMonthlySavingsWon
  };
}

export function analyzeSnapshot(snapshot = {}, policy = DEFAULT_POLICY) {
  const totalPowerW = finiteNumber(snapshot.totalPowerW);
  const baselinePowerW = finiteNumber(snapshot.baselinePowerW);
  const devices = Array.isArray(snapshot.devices) ? snapshot.devices : [];
  const recommendations = [];

  if (totalPowerW === null) {
    recommendations.push(recommendation({
      code: 'telemetry_missing',
      severity: 'info',
      title: '전력 데이터 연결이 필요합니다',
      detail: '현재 총사용전력이 아직 입력되지 않았습니다. 분석은 가능하지만 실제 제어는 활성화하지 않습니다.'
    }));
  }

  if (totalPowerW !== null && baselinePowerW !== null && baselinePowerW >= 0) {
    const threshold = Math.max(
      baselinePowerW * policy.anomalyMultiplier,
      baselinePowerW + policy.anomalyMinDeltaW
    );
    if (totalPowerW > threshold) {
      recommendations.push(recommendation({
        code: 'whole_home_power_anomaly',
        severity: 'warning',
        title: '평소보다 높은 전력 사용이 감지되었습니다',
        detail: `현재 ${Math.round(totalPowerW)}W, 기준 ${Math.round(baselinePowerW)}W입니다. 원인 기기를 확인한 뒤 차단 여부를 결정하세요.`
      }));
    }
  }

  for (const device of devices) {
    const powerW = finiteNumber(device.powerW);
    const expectedMaxW = finiteNumber(device.expectedMaxW);
    const protectedDevice = isProtected(device);
    const target = device.id || device.name || 'unknown-device';

    if (powerW !== null && expectedMaxW !== null && expectedMaxW > 0 && powerW > expectedMaxW * policy.deviceExpectedMaxRatio) {
      recommendations.push(recommendation({
        code: protectedDevice ? 'protected_device_above_expected' : 'device_above_expected',
        severity: protectedDevice ? 'critical' : 'warning',
        title: `${device.name || '기기'} 사용전력이 예상 범위를 벗어났습니다`,
        detail: protectedDevice
          ? '보호 대상 기기이므로 AI가 전원을 조작하지 않습니다. 상태 확인 또는 전문가 점검을 우선하세요.'
          : '기기 상태를 확인하고 필요하면 사용을 줄이거나 점검을 요청하세요.',
        target
      }));
    }

    const idleLoad = device.idle === true && device.state === 'on' && device.controllable === true;
    if (!protectedDevice && idleLoad && powerW !== null && powerW >= policy.standbyThresholdW) {
      recommendations.push(recommendation({
        code: 'device_idle_load',
        severity: 'suggestion',
        title: `${device.name || '기기'}가 사용하지 않는 동안 전력을 소비하고 있습니다`,
        detail: '전원 끄기를 제안할 수 있지만 실제 실행은 사용자 승인 뒤에만 허용합니다.',
        target,
        proposedAction: 'device.power_off',
        humanGate: true,
        estimatedMonthlySavingsWon: estimateMonthlySavingsWon(device, snapshot.pricePerKwh)
      }));
    }
  }

  return {
    policyMode: policy.mode,
    generatedAt: new Date().toISOString(),
    telemetryReady: totalPowerW !== null,
    controlEnabled: false,
    recommendationCount: recommendations.length,
    recommendations
  };
}

export function classifyRequestedAction(actionType, device = {}, policy = DEFAULT_POLICY) {
  if (policy.forbiddenActions.includes(actionType)) {
    return { decision: 'blocked', reason: 'forbidden_action' };
  }
  if (isProtected(device) && actionType.includes('power_')) {
    return { decision: 'blocked', reason: 'protected_device' };
  }
  if (policy.humanGateActions.includes(actionType)) {
    return { decision: 'awaiting_human', reason: 'human_gate_required' };
  }
  if (policy.autonomousActions.includes(actionType)) {
    return { decision: 'assist_only', reason: 'non_mutating_autonomy' };
  }
  return { decision: 'awaiting_human', reason: 'unknown_action_fails_closed' };
}
