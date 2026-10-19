// SEARCH-EXPOSURE-ALL-001 live audit: every public site in the EKODI public
// registry must be crawlable (HTTP 200, no noindex) and carry a canonical and
// an index-allowing robots signal. Read-only; prints a JSON evidence report.
const origin = 'https://ekodi.kr';
const ua = 'EKODI-Search-Exposure-Audit/1.0';
const timeoutMs = Number(process.env.AUDIT_TIMEOUT_MS || 20000);

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { 'user-agent': ua, 'cache-control': 'no-cache' }, redirect: 'manual', signal: controller.signal });
    return { status: response.status, headers: response.headers, text: await response.text() };
  } finally { clearTimeout(timer); }
}

export function auditHtml({ status, headers, text }) {
  const head = (String(text).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
  const xRobots = String(headers.get('x-robots-tag') || '');
  const robotsMeta = (head.match(/<meta\b(?=[^>]*\bname=(['"]?)robots\1)[^>]*content=(['"])([^'"]*)\2/i) || [])[3] || '';
  const canonical = (head.match(/<link\b(?=[^>]*\brel=(['"]?)canonical\1)[^>]*href=(['"])([^'"]+)\2/i) || [])[3] || '';
  const problems = [];
  if (status !== 200) problems.push(`http_${status}`);
  if (/noindex|none/i.test(xRobots)) problems.push('x_robots_noindex');
  if (/noindex|none/i.test(robotsMeta)) problems.push('meta_noindex');
  if (status === 200 && !canonical) problems.push('canonical_missing');
  return { ok: problems.length === 0, problems, canonical, robots: robotsMeta || xRobots || '(default index)' };
}

async function main() {
  const robots = await get(origin + '/robots.txt');
  const robotsOk = robots.status === 200 && /User-agent: Yeti/.test(robots.text) && /Sitemap: https:\/\/ekodi\.kr\/sitemap\.xml/.test(robots.text);
  const sitemap = await get(origin + '/sitemap.xml');
  const registry = JSON.parse((await get(origin + '/public-registry.json')).text);
  const sites = (registry.resources || []).filter(resource => resource.type === 'site' || resource.source === 'discovery-layer');
  const results = [];
  for (const site of sites) {
    try { results.push({ url: site.url, ...auditHtml(await get(site.url)) }); }
    catch (error) { results.push({ url: site.url, ok: false, problems: ['fetch_' + (error.name || 'error')] }); }
  }
  const failed = results.filter(result => !result.ok);
  const report = {
    policy: 'EKODI-SEARCH-EXPOSURE-ALL-001', checkedAt: new Date().toISOString(),
    robots: { status: robots.status, ok: robotsOk }, sitemap: { status: sitemap.status, urls: (sitemap.text.match(/<loc>/g) || []).length },
    registryCount: registry.count, auditedSites: results.length, passed: results.length - failed.length, failed,
  };
  console.log(JSON.stringify(report, null, 2));
  // Annotations are readable through the checks API even when raw logs are not.
  console.log(`::notice title=SEARCH-EXPOSURE-ALL-001::robots=${robotsOk ? 'ok' : 'fail'} sitemap=${sitemap.status}/${report.sitemap.urls} passed=${report.passed}/${report.auditedSites}`);
  for (const item of failed.slice(0, 40)) console.log(`::error title=search-exposure::${item.url} ${item.problems.join(',')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    const rows = results.map(r => `| ${r.url} | ${r.ok ? '✅' : '❌ ' + r.problems.join(',')} | ${r.robots || ''} |`).join('\n');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## 사용자 사이트 검색 노출 점검\n\nrobots ${robotsOk ? '✅' : '❌'} · sitemap URL ${report.sitemap.urls} · 통과 ${report.passed}/${report.auditedSites}\n\n| URL | 결과 | robots |\n|---|---|---|\n${rows}\n`);
  }
  if (!robotsOk || sitemap.status !== 200 || failed.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exit(1); });
