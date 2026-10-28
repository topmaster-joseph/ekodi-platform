// EKODI production verifier: honor real HTTP 429 without bypassing access control.
// This helper never changes HTTP responses, tokens, headers or Cloudflare security policy.
export const ADMIN_ENTRY_MAX_429_RETRIES = 3;
export const ADMIN_ENTRY_TOTAL_RETRY_BUDGET_MS = 90000;
const FALLBACK_DELAYS_MS = Object.freeze([8000, 18000, 35000]);

export function parseRetryAfterMs(header, nowMs = Date.now()) {
  if (typeof header !== 'string') return null;
  const value = header.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
}

export async function gotoAdminWith429Backoff(page, url, {
  wait = ms => page.waitForTimeout(ms),
  now = () => Date.now(),
  log = message => console.warn(message),
} = {}) {
  let totalWaitMs = 0;
  for (let attempt = 0; attempt <= ADMIN_ENTRY_MAX_429_RETRIES; attempt += 1) {
    const response = await page.goto(url, { waitUntil:'domcontentloaded', timeout:45000 });
    // Never retry or fabricate success for 401, 403, 404, 5xx, TLS, network or JS errors.
    if (!response || response.status() !== 429) return response;
    if (attempt === ADMIN_ENTRY_MAX_429_RETRIES) {
      throw new Error('Admin entry remained HTTP 429 after bounded rate-limit retries');
    }
    const rawRetryAfter = await response.headerValue('retry-after').catch(() => null);
    const advisedDelay = parseRetryAfterMs(rawRetryAfter, now());
    const fallbackDelay = FALLBACK_DELAYS_MS[attempt];
    // Follow server advice when present; never retry earlier than Retry-After.
    const delayMs = advisedDelay === null ? fallbackDelay : Math.max(1000, advisedDelay);
    if (!Number.isFinite(delayMs) || totalWaitMs + delayMs > ADMIN_ENTRY_TOTAL_RETRY_BUDGET_MS) {
      throw new Error('Admin entry HTTP 429 Retry-After exceeds bounded verifier retry budget');
    }
    totalWaitMs += delayMs;
    log('[PROD-E2E] Admin entry HTTP 429; respecting bounded backoff attempt ' +
      (attempt + 1) + '/' + ADMIN_ENTRY_MAX_429_RETRIES + ', delayMs=' + delayMs);
    await wait(delayMs);
  }
  throw new Error('Admin entry retry budget exhausted');
}
