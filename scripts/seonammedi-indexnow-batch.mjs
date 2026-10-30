// EKODI IndexNow is a plain HTTPS JSON protocol. Do not start an
// unnecessary third-party browser, install Chromium or use paid API services.
// Three first-party Node fetch calls replace 3 x N per-URL browser navigations.
export const INDEXNOW_ENDPOINTS = Object.freeze([
  ['naver', 'https://searchadvisor.naver.com/indexnow'],
  ['bing', 'https://www.bing.com/indexnow'],
  ['indexnow', 'https://api.indexnow.org/indexnow'],
]);

export function indexNowPayload({ urls, key, canonicalOrigin }) {
  if (!Array.isArray(urls) || !urls.length || urls.length > 150) {
    throw new Error('Unexpected published URL count');
  }
  if (!/^[0-9a-fA-F-]{8,128}$/.test(String(key || ''))) {
    throw new Error('Invalid public IndexNow key');
  }
  const origin = new URL(canonicalOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash ||
      origin.username || origin.password || origin.hostname !== 'xn--3e0b8b58jw4co4mnpll3k.kr') {
    throw new Error('Unexpected EKODI customer-domain canonical origin');
  }
  const dedup = [...new Set(urls)];
  if (dedup.length !== urls.length) throw new Error('Duplicate sitemap links require normalization');
  for (const item of urls) {
    let url;
    try { url = new URL(item); } catch { throw new Error('Invalid submission URL'); }
    if (url.origin !== origin.origin || url.href !== item || url.search || url.hash) {
      throw new Error('Cross-domain or noncanonical IndexNow URL');
    }
  }
  return {
    host: origin.hostname,
    key,
    keyLocation: origin.origin + '/' + key + '.txt',
    urlList: urls,
  };
}

export async function submitIndexNowBatches({ urls, key, canonicalOrigin, fetchImpl = fetch }) {
  const payload = indexNowPayload({ urls, key, canonicalOrigin });
  const body = JSON.stringify(payload);
  const results = [];
  for (const [name, endpoint] of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json, text/plain, */*' },
        body,
        signal: AbortSignal.timeout(25000),
      });
      const status = response?.status ?? 0;
      results.push({ name, endpoint, status, ok: status === 200 || status === 202, urls: urls.length });
    } catch (error) {
      results.push({ name, endpoint, status: 0, ok: false, urls: urls.length, error: String(error?.name || 'network_error') });
    }
  }
  return { ok: results.every(row => row.ok), urlCount: urls.length, results };
}
