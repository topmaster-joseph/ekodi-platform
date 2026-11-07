// Optional integration helper for any EKODI site: site login passes its own Supabase token.
// Import from same-origin site code. Never accept a locally entered DOB as proof.
const ROOT = '/api/age-verification';
async function call(path, token, body) {
  if (typeof token !== 'string' || !token) throw new Error('login_required');
  const response = await fetch(ROOT + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || 'age_verification_unavailable');
  return value;
}
function portOneSdk() {
  if (globalThis.PortOne?.requestIdentityVerification) return Promise.resolve(globalThis.PortOne);
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://cdn.portone.io/v2/browser-sdk.js';
    tag.async = true;
    tag.onload = () => globalThis.PortOne ? resolve(globalThis.PortOne) : reject(new Error('sdk_unavailable'));
    tag.onerror = () => reject(new Error('sdk_unavailable'));
    document.head.appendChild(tag);
  });
}
export async function verifyEkodiAdult({ site, accessToken, redirectUrl } = {}) {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(site || '')) throw new Error('invalid_site');
  const start = await call('/start', accessToken, { site });
  const sdk = await portOneSdk();
  // On redirect-based browser flows, the host page must rehydrate the session and
  // call completeEkodiAdult() using the returned identityVerificationId.
  // KG Inicis unified identity requires flgFixedUser. N lets the certified
  // provider collect details; EKODI does not ask for or persist raw customer PII.
  if (!['portone-v2', 'kg-inicis-unified'].includes(start.provider))
    throw new Error('provider_unavailable');
  const payload = {
    storeId: start.storeId, channelKey: start.channelKey,
    identityVerificationId: start.identityVerificationId,
    ...(redirectUrl ? { redirectUrl } : {}),
    ...(start.provider === 'kg-inicis-unified'
      ? { bypass: { inicisUnified: { flgFixedUser: 'N' } } } : {}),
  };
  const result = await sdk.requestIdentityVerification(payload);
  if (result && result.code !== undefined) throw new Error('provider_not_verified');
  return await completeEkodiAdult({ site, accessToken, identityVerificationId: start.identityVerificationId });
}
export async function completeEkodiAdult({ site, accessToken, identityVerificationId }) {
  return call('/complete', accessToken, { site, identityVerificationId });
}
export async function ekodiAdultStatus({ site, accessToken }) {
  return call('/status?site=' + encodeURIComponent(site), accessToken);
}
