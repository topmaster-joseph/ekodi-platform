import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sites = [
  ['mall', '에코디몰', 'ekodimall.kr'],
  ['biz', '에코디비즈', 'ekodibiz.kr'],
  ['publishing', '에코디출판', 'ekodibook.kr'],
  ['church', '에코디교회', 'ekodichurch.kr'],
  ['lab', '에코디연구소', 'ekodilab.kr'],
  ['mission', '에코디선교회', 'youtube.com/@ekodicommunity', 'https://youtube.com/@ekodicommunity']
];

async function checkSite([id, name, domain, targetUrl]) {
  const url = targetUrl || `https://${domain}`;
  const started = performance.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'EKODI-Monitor/1.0' }
    });
    await response.body?.cancel();
    const responseTime = Math.round(performance.now() - started);
    const reachable = response.status >= 200 && response.status < 400;
    const status = !reachable ? 'offline' : responseTime > 2000 ? 'degraded' : 'online';
    return { id, name, domain, url, status, httpStatus: response.status, responseTime, checkedAt, error: null };
  } catch (error) {
    return { id, name, domain, url, status: 'offline', httpStatus: null, responseTime: Math.round(performance.now() - started), checkedAt, error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error) };
  }
}

const results = await Promise.all(sites.map(checkSite));
const summary = {
  total: results.length,
  online: results.filter(site => site.status === 'online').length,
  degraded: results.filter(site => site.status === 'degraded').length,
  offline: results.filter(site => site.status === 'offline').length
};
const payload = { generatedAt: new Date().toISOString(), summary, sites: results };
await writeFile(fileURLToPath(new URL('../monitor-status.json', import.meta.url)), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary));
