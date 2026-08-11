export const SITE_DEFINITIONS = Object.freeze([
  ['mall', '에코디몰', 'mall.ekodi.kr'],
  ['biz', '에코디비즈', 'biz.ekodi.kr'],
  ['publishing', '에코디출판', 'books.ekodi.kr'],
  ['church', '에코디교회', 'church.ekodi.kr'],
  ['lab', '에코디연구소', 'lab.ekodi.kr'],
  ['mission', '에코디선교회', 'youtube.com/@ekodicommunity', 'https://youtube.com/@ekodicommunity']
]);

export function classifyStatus(httpStatus, responseTime) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 400) return 'offline';
  return responseTime > 2000 ? 'degraded' : 'online';
}

export async function checkSite(
  [id, name, domain, targetUrl],
  { fetchImpl = fetch, clock = () => performance.now(), now = () => new Date() } = {}
) {
  const url = targetUrl || `https://${domain}`;
  const started = clock();
  const checkedAt = now().toISOString();

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'EKODI-Monitor/1.0' }
    });
    await response.body?.cancel();
    const responseTime = Math.round(clock() - started);
    return {
      id,
      name,
      domain,
      url,
      status: classifyStatus(response.status, responseTime),
      httpStatus: response.status,
      responseTime,
      checkedAt,
      error: null
    };
  } catch (error) {
    return {
      id,
      name,
      domain,
      url,
      status: 'offline',
      httpStatus: null,
      responseTime: Math.round(clock() - started),
      checkedAt,
      error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error)
    };
  }
}

export function buildPayload(results, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    summary: {
      total: results.length,
      online: results.filter(site => site.status === 'online').length,
      degraded: results.filter(site => site.status === 'degraded').length,
      offline: results.filter(site => site.status === 'offline').length
    },
    sites: results
  };
}

function operationalSignature(payload) {
  return JSON.stringify((payload?.sites || []).map(site => ({
    id: site.id,
    status: site.status,
    httpStatus: site.httpStatus,
    error: site.error
  })));
}

export function shouldPublish(previous, next, now = Date.now(), maxAgeMs = 6 * 60 * 60 * 1000) {
  if (!previous?.generatedAt || operationalSignature(previous) !== operationalSignature(next)) return true;
  const previousTime = Date.parse(previous.generatedAt);
  return !Number.isFinite(previousTime) || now - previousTime >= maxAgeMs;
}
