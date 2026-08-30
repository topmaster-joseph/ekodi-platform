const DEFAULT_REMOTE_POWER_DEVICES = Object.freeze([
  Object.freeze({ id: 'joseph-notebook', label: 'JosephNotebook' }),
  Object.freeze({ id: 'user3', label: 'user3' }),
  Object.freeze({ id: 'user2', label: 'user2' })
]);

function safeDevices(env) {
  const source = String(env.REMOTE_POWER_DEVICES_JSON || '').trim();
  if (!source) return DEFAULT_REMOTE_POWER_DEVICES;
  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) return DEFAULT_REMOTE_POWER_DEVICES;
    const devices = parsed.map(item => ({
      id: String(item?.id || '').trim().toLowerCase(),
      label: String(item?.label || item?.id || '').trim()
    })).filter(item => /^[a-z0-9-]{1,64}$/.test(item.id) && item.label);
    return devices.length ? devices : DEFAULT_REMOTE_POWER_DEVICES;
  } catch {
    return DEFAULT_REMOTE_POWER_DEVICES;
  }
}

function relayBaseUrl(env) {
  return String(env.REMOTE_POWER_RELAY_URL || '').trim().replace(/\/+$/, '');
}

function relayConfigured(env) {
  return Boolean(relayBaseUrl(env) && String(env.REMOTE_POWER_SHARED_SECRET || '').trim());
}

async function hmacHex(secret, input) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function remotePowerSnapshot(env) {
  return {
    relayConfigured: relayConfigured(env),
    devices: safeDevices(env).map(device => ({ ...device, status: 'unknown' }))
  };
}

export async function requestRemoteWake(env, deviceId) {
  const devices = safeDevices(env);
  const device = devices.find(item => item.id === deviceId);
  if (!device) return { status: 404, body: { error: '관리 대상 원격 PC가 아닙니다.' } };
  if (!relayConfigured(env)) {
    return { status: 503, body: { error: '원격 전원 릴레이가 아직 설정되지 않았습니다.', code: 'REMOTE_POWER_RELAY_NOT_CONFIGURED' } };
  }

  const body = JSON.stringify({ deviceId: device.id });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await hmacHex(String(env.REMOTE_POWER_SHARED_SECRET), `${timestamp}.${body}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 8000);
  try {
    const response = await fetch(`${relayBaseUrl(env)}/wake`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ekodi-timestamp': timestamp,
        'x-ekodi-signature': signature
      },
      body,
      signal: controller.signal
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      return {
        status: response.status,
        body: { error: payload?.error || `원격 전원 릴레이 오류 (HTTP ${response.status})`, code: payload?.code || 'REMOTE_POWER_RELAY_ERROR' }
      };
    }
    return {
      status: 202,
      body: { ok: true, deviceId: device.id, label: device.label, status: 'wake_requested', requestedAt: new Date().toISOString() }
    };
  } catch (error) {
    return {
      status: 502,
      body: { error: error?.name === 'AbortError' ? '원격 전원 릴레이 응답 시간이 초과되었습니다.' : '원격 전원 릴레이에 연결할 수 없습니다.', code: 'REMOTE_POWER_RELAY_UNREACHABLE' }
    };
  } finally {
    clearTimeout(timer);
  }
}
