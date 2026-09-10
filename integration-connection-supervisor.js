const DEFAULT_DELAYS_MS = Object.freeze([250, 1000, 3000]);

export const CONNECTION_RECOVERY_POLICY = Object.freeze({
  automatic:true,
  explicitDisconnectWins:true,
  refreshBeforeReauth:true,
  boundedRetries:true,
  respectRetryAfter:true,
  states:Object.freeze([
    'connected','degraded','recovering','reauth_required',
    'permission_required','disconnected','circuit_open',
  ]),
});

function text(value) { return String(value ?? '').trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function retryAfterMs(value, now = Date.now()) {
  const raw = text(value);
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.max(0, Number(raw) * 1000);
  const target = Date.parse(raw);
  return Number.isFinite(target) ? Math.max(0, target - now) : 0;
}
export function classifyConnectionFailure(input = {}) {
  const status = number(input.status || input.response?.status);
  const code = lower(input.code || input.error?.code || input.providerCode);
  const message = lower(input.message || input.error?.message);
  if (input.explicitlyDisconnected === true || ['revoked','disconnected','user_disconnected'].includes(code)) {
    return 'disconnected';
  }
  if (code.includes('insufficient_scope') || code.includes('permission') || status === 403) {
    return 'permission_required';
  }
  if (['invalid_grant','access_denied','consent_required','interaction_required'].some(item => code.includes(item) || message.includes(item))) {
    return 'reauth_required';
  }
  if (status === 401 || code.includes('token_expired') || code.includes('reauth')) {
    return 'refresh_required';
  }
  if (status === 429 || code.includes('rate_limit')) return 'rate_limited';
  if (status >= 500 || status === 408 || status === 425 || code.includes('network') || code.includes('timeout')) {
    return 'transient';
  }
  return 'fatal';
}

function resultOk(result) {
  if (result == null) return false;
  if (typeof result === 'boolean') return result;
  if (typeof result.ok === 'boolean') return result.ok;
  return number(result.status, 200) >= 200 && number(result.status, 200) < 400;
}
function failureInput(value) {
  if (value instanceof Response) {
    return { status:value.status, response:value, retryAfter:value.headers.get('retry-after') };
  }
  return {
    status:value?.status || value?.response?.status,
    code:value?.code,
    providerCode:value?.providerCode,
    message:value?.message,
    error:value,
    retryAfter:value?.retryAfter || value?.response?.headers?.get?.('retry-after'),
  };
}

async function emit(onState, state, detail = {}) {
  if (typeof onState === 'function') await onState(Object.freeze({ state, ...detail }));
}

function delayFor(attempt, retryAfter, delays) {
  const providerDelay = retryAfterMs(retryAfter);
  if (providerDelay) return providerDelay;
  return delays[Math.min(attempt, delays.length - 1)] || 0;
}

export async function superviseConnection(options = {}) {
  const probe = options.probe;
  if (typeof probe !== 'function') throw new TypeError('probe is required');
  const maxAttempts = Math.max(1, number(options.maxAttempts, 3));
  const delays = Array.isArray(options.delaysMs) && options.delaysMs.length ? options.delaysMs : DEFAULT_DELAYS_MS;
  const sleep = typeof options.sleep === 'function' ? options.sleep : ms => new Promise(resolve => setTimeout(resolve, ms));
  const explicitlyDisconnected = typeof options.isExplicitlyDisconnected === 'function'
    ? await options.isExplicitlyDisconnected() : options.explicitlyDisconnected === true;
  if (explicitlyDisconnected) {
    await emit(options.onState, 'disconnected', { reason:'explicit_disconnect' });
    return { ok:false, state:'disconnected', attempts:0, reason:'explicit_disconnect' };
  }

  let refreshed = false;
  let lastFailure = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (attempt > 0) await emit(options.onState, 'recovering', { attempt:attempt + 1 });
      const result = await probe({ attempt, refreshed });
      if (resultOk(result)) {
        await emit(options.onState, 'connected', { attempt:attempt + 1, recovered:attempt > 0 || refreshed });
        return { ok:true, state:'connected', attempts:attempt + 1, recovered:attempt > 0 || refreshed, result };
      }
      lastFailure = failureInput(result);
    } catch (error) {
      lastFailure = failureInput(error);
    }

    const classification = classifyConnectionFailure(lastFailure);
    if (classification === 'disconnected') {
      await emit(options.onState, 'disconnected', { attempt:attempt + 1 });
      return { ok:false, state:'disconnected', attempts:attempt + 1, reason:'explicit_disconnect' };
    }
    if (classification === 'permission_required') {
      await emit(options.onState, 'permission_required', { attempt:attempt + 1 });
      return { ok:false, state:'permission_required', attempts:attempt + 1 };
    }
    if ((classification === 'refresh_required' || classification === 'reauth_required') && !refreshed && typeof options.refresh === 'function') {
      try {
        await emit(options.onState, 'recovering', { attempt:attempt + 1, action:'refresh' });
        const refreshResult = await options.refresh({ attempt, failure:lastFailure });
        if (!resultOk(refreshResult)) throw Object.assign(new Error('refresh failed'), failureInput(refreshResult));
        refreshed = true;
        continue;
      } catch (error) {
        const refreshClass = classifyConnectionFailure(failureInput(error));
        if (refreshClass === 'permission_required') {
          await emit(options.onState, 'permission_required', { attempt:attempt + 1, action:'refresh' });
          return { ok:false, state:'permission_required', attempts:attempt + 1 };
        }
        if (['reauth_required','refresh_required','fatal'].includes(refreshClass)) {
          await emit(options.onState, 'reauth_required', { attempt:attempt + 1 });
          return { ok:false, state:'reauth_required', attempts:attempt + 1 };
        }
        lastFailure = failureInput(error);
      }
    } else if (classification === 'reauth_required' || classification === 'refresh_required') {
      await emit(options.onState, 'reauth_required', { attempt:attempt + 1 });
      return { ok:false, state:'reauth_required', attempts:attempt + 1 };
    } else if (classification === 'fatal') {
      await emit(options.onState, 'degraded', { attempt:attempt + 1, fatal:true });
      return { ok:false, state:'degraded', attempts:attempt + 1, reason:'fatal' };
    }

    if (attempt + 1 < maxAttempts) {
      const delayMs = delayFor(attempt, lastFailure?.retryAfter, delays);
      await emit(options.onState, 'degraded', { attempt:attempt + 1, delayMs, classification });
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  await emit(options.onState, 'circuit_open', { attempts:maxAttempts });
  return { ok:false, state:'circuit_open', attempts:maxAttempts, reason:'retry_exhausted', failure:lastFailure };
}

export function connectionRecoverySnapshot(state = {}) {
  return Object.freeze({
    version:'2026-09-06.1',
    policy:CONNECTION_RECOVERY_POLICY,
    state:text(state.state) || 'connected',
    lastVerifiedAt:text(state.lastVerifiedAt) || null,
    lastRecoveredAt:text(state.lastRecoveredAt) || null,
    requiresUserAction:['reauth_required','permission_required'].includes(text(state.state)),
  });
}
