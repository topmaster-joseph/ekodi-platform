// EKODI first-party authenticated Control API adapter.
// The caller supplies an existing, short-lived admin session from a trusted runtime.
// Do not send bearer tokens to chat, logs, URL parameters, or connected third parties.
const ORIGIN = 'https://ekodi.kr';
const ROOT = '/api/control/devices';
const TYPE = 'computer.browser.canary';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const asTime = s => Date.parse(String(s || ''));

export function agentEligible(d, now = Date.now()) {
  const seen = asTime(d?.lastSeenAt);
  return d?.status === 'online' && d?.revokedAt == null &&
    d?.management?.source === 'agent' && d?.management?.type === 'pc' &&
    /win/i.test(String(d?.platform || '')) &&
    Number.isFinite(seen) && seen <= now && now-seen <= 90000;
}

export function verifyBrowserCanaryReceipt(command) {
  const p = command?.result?.browserCanary;
  return command?.type === TYPE && command?.status === 'succeeded' &&
    p?.ok === true && p?.mode === 'native-cdp' &&
    p?.url === ORIGIN + '/' && Number(p?.contentBytes) > 0 &&
    p?.dedicatedAutomationProfile === true && p?.focusIsolated === true &&
    p?.clipboardShared === false && p?.userInputInjection === false;
}

export function createAuthenticatedAgentBridge({
  getToken, fetchImpl = fetch, now = Date.now, sleep = delay
} = {}) {
  if (typeof getToken !== 'function') throw new Error('trusted_session_provider_required');
  const active = new Set();
  async function request(path, method='GET', body) {
    const token = getToken();
    if (typeof token !== 'string' || token.length < 20) throw new Error('trusted_admin_session_required');
    const res = await fetchImpl(ORIGIN + path, {
      method, cache:'no-store', redirect:'error',
      headers:{ authorization:'Bearer '+token, accept:'application/json',
        ...(body ? {'content-type':'application/json'} : {}) },
      ...(body ? {body:JSON.stringify(body)} : {}),
      signal:AbortSignal.timeout(15000)
    });
    // Never expose the remote error body: it might contain sensitive information.
    if (!res.ok) throw new Error('device_control_http_'+res.status);
    const result = await res.json();
    if (!result || typeof result !== 'object') throw new Error('invalid_device_response');
    return result;
  }
  async function list() {
    const payload = await request(ROOT);
    if (!Array.isArray(payload.devices)) throw new Error('device_list_contract_invalid');
    return payload.devices;
  }
  async function canary({deviceId, confirmed=false, maxPoll=35, pollMs=4000}={}) {
    if (confirmed !== true) throw new Error('explicit_admin_confirmation_required');
    if (typeof deviceId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(deviceId))
      throw new Error('invalid_device_id');
    if (active.has(deviceId)) throw new Error('device_canary_already_running');
    active.add(deviceId);
    try {
      const d = (await list()).find(item=>item.id === deviceId);
      if (!agentEligible(d, now())) throw new Error('native_agent_not_ready');
      let c = (d.recentCommands || []).find(item=>item.type === TYPE &&
        ['queued','claimed'].includes(item.status) && Number.isFinite(asTime(item.issuedAt)) &&
        now() - asTime(item.issuedAt) >= 0 && now() - asTime(item.issuedAt) < 120000);
      if (!c) {
        const result = await request(ROOT+'/'+encodeURIComponent(deviceId)+'/commands',
          'POST',{type:TYPE, confirmed:true});
        c = result.command;
        if (!c || c.type !== TYPE || c.status !== 'queued' || !c.id)
          throw new Error('canary_enqueue_contract_invalid');
      }
      for(let i=0;i<maxPoll;i++) {
        if(i>0) await sleep(pollMs);
        const current = (await list()).find(item=>item.id === deviceId);
        const receipt = (current?.recentCommands || []).find(item=>item.id === c.id);
        if(!receipt || ['queued','claimed'].includes(receipt.status)) continue;
        if(receipt.status !== 'succeeded') throw new Error('canary_execution_unsuccessful');
        if(!agentEligible(current, now())) throw new Error('native_agent_heartbeat_lost');
        if(!verifyBrowserCanaryReceipt(receipt)) throw new Error('native_browser_receipt_invalid');
        return Object.freeze({verified:true, deviceId, commandId:c.id,
          mode:'native-cdp', completedAt:receipt.completedAt || null});
      }
      throw new Error('canary_receipt_timeout');
    } finally { active.delete(deviceId); }
  }
  return Object.freeze({list, canary});
}
