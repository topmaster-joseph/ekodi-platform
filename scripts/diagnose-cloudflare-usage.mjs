import fs from 'node:fs/promises';
import { classifyTrafficUserAgent } from '../traffic-intelligence.js';
import { collectProductUsage } from './cloudflare-usage-product-metrics.mjs';

const cfApi = 'https://api.cloudflare.com/client/v4';
const prod = {
  label:'PROD',
  accountId:String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
  token:String(process.env.CLOUDFLARE_API_TOKEN || '').trim(),
};
const dev = {
  label:'DEV',
  accountId:String(process.env.CLOUDFLARE_DEVELOPMENT_ACCOUNT_ID || '').trim(),
  token:String(process.env.CLOUDFLARE_DEVELOPMENT_API_TOKEN || '').trim(),
};
const outputJson = process.argv[2] || '/tmp/ekodi-cloudflare-usage-diagnose.json';
const outputMd = process.argv[3] || '/tmp/ekodi-cloudflare-usage-diagnose.md';

function windowUtc() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start:start.toISOString(), end:end.toISOString() };
}
function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }
function safeRatio(n, d) { return d > 0 ? Math.round((n / d) * 100) / 100 : 0; }
function severity(value, warn, critical) {
  if (value >= critical) return 'critical';
  if (value >= warn) return 'warning';
  return 'ok';
}
async function cf(account, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${account.token}`);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${cfApi}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const detail = payload?.errors?.[0]?.message || `Cloudflare HTTP ${response.status}`;
    throw new Error(`${account.label}: ${detail}`);
  }
  return payload;
}
async function gql(account, query, variables) {
  const payload = await cf(account, '/graphql', {
    method:'POST',
    body:JSON.stringify({ query, variables }),
  });
  if (payload?.errors?.length) throw new Error(`${account.label}: ${payload.errors[0]?.message || 'GraphQL error'}`);
  return payload;
}

async function workerUsage(account, window) {
  const query = `query Usage($accountTag: string, $start: string, $end: string) {
    viewer { accounts(filter:{accountTag:$accountTag}) {
      workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$start, datetime_leq:$end}) {
        dimensions { scriptName status }
        sum { requests subrequests errors }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
    } }
  }`;
  const payload = await gql(account, query, {
    accountTag:account.accountId, start:window.start, end:window.end,
  });
  const rows = payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  const scripts = new Map();
  for (const row of rows) {
    const name = String(row?.dimensions?.scriptName || 'unknown');
    if (!scripts.has(name)) scripts.set(name, { script:name, requests:0, subrequests:0, errors:0, cpuP99:0, statuses:{} });
    const item = scripts.get(name);
    item.requests += Number(row?.sum?.requests || 0);
    item.subrequests += Number(row?.sum?.subrequests || 0);
    item.errors += Number(row?.sum?.errors || 0);
    item.cpuP99 = Math.max(item.cpuP99, Number(row?.quantiles?.cpuTimeP99 || 0));
    const status = String(row?.dimensions?.status || 'unknown');
    item.statuses[status] = (item.statuses[status] || 0) + Number(row?.sum?.requests || 0);
  }
  const list = [...scripts.values()].map(item => ({
    ...item,
    subrequestRatio:safeRatio(item.subrequests, item.requests),
    errorPercent:pct(item.errors, item.requests),
    nonOkStatuses:Object.entries(item.statuses || {}).filter(([status]) => !['ok','success','unknown'].includes(status)).sort((a,b)=>b[1]-a[1]),
  })).sort((a,b) => b.requests - a.requests);
  return {
    requests:list.reduce((sum, item) => sum + item.requests, 0),
    subrequests:list.reduce((sum, item) => sum + item.subrequests, 0),
    errors:list.reduce((sum, item) => sum + item.errors, 0),
    scripts:list,
  };
}

async function activeZones(account) {
  const payload = await cf(account, `/zones?per_page=50&status=active&account.id=${encodeURIComponent(account.accountId)}`);
  return (payload?.result || []).filter(zone => zone?.id && zone?.name).map(zone => ({ id:String(zone.id), name:String(zone.name) }));
}

async function zoneTraffic(account, zone, window) {
  const result = {
    zone:zone.name, requests:0, botRequests:0, internalRequests:0,
    healthRequests:0, devToProdSuspectRequests:0, hostRequests:[], cache:{ available:false, hit:0, miss:0, bypass:0, other:0 }, warnings:[],
  };
  const uaQuery = `query ZoneUA($zoneTag:string,$start:Time,$end:Time) { viewer { zones(filter:{zoneTag:$zoneTag}) { rows:httpRequestsAdaptiveGroups(limit:5000,filter:{datetime_geq:$start,datetime_lt:$end,requestSource:"eyeball"},orderBy:[count_DESC]) { count dimensions { userAgent clientRequestHTTPHost } } } } }`;
  try {
    const payload = await gql(account, uaQuery, { zoneTag:zone.id, start:window.start, end:window.end });
    const rows = payload?.data?.viewer?.zones?.[0]?.rows || [];
    const hostCounts=new Map();
    for (const row of rows) {
      const count = Number(row?.count || 0);
      result.requests += count;
      const rawUserAgent = String(row?.dimensions?.userAgent || '');
      const host=String(row?.dimensions?.clientRequestHTTPHost || zone.name).trim().toLowerCase();
      if(host)hostCounts.set(host,(hostCounts.get(host)||0)+count);
      const category = classifyTrafficUserAgent(rawUserAgent).category;
      if (category === 'search_bot' || category === 'other_bot') result.botRequests += count;
      if (category === 'ekodi_internal') {
        result.internalRequests += count;
        if (account.label === 'PROD' && /(?:^|[-_/])(dev|development|staging)(?:$|[-_/])/i.test(rawUserAgent)) result.devToProdSuspectRequests += count;
      }
    }
    result.hostRequests=[...hostCounts].map(([host,requests])=>({host,requests})).sort((a,b)=>b.requests-a.requests).slice(0,20);
  } catch (error) { result.warnings.push(`ua:${String(error.message).slice(0,120)}`); }

  const healthQuery = `query ZoneHealth($zoneTag:string,$start:Time,$end:Time) { viewer { zones(filter:{zoneTag:$zoneTag}) { rows:httpRequestsAdaptiveGroups(limit:5000,filter:{datetime_geq:$start,datetime_lt:$end,requestSource:"eyeball"},orderBy:[count_DESC]) { count dimensions { clientRequestPath } } } } }`;
  try {
    const payload = await gql(account, healthQuery, { zoneTag:zone.id, start:window.start, end:window.end });
    result.healthRequests = (payload?.data?.viewer?.zones?.[0]?.rows || []).reduce((sum,row) => {
      const path = String(row?.dimensions?.clientRequestPath || '');
      return /(?:^|\/)(health|healthz|ready|readiness|live|liveness)(?:\/|$)/i.test(path) ? sum + Number(row?.count || 0) : sum;
    }, 0);
  } catch (error) { result.warnings.push(`health:${String(error.message).slice(0,120)}`); }

  const cacheQuery = `query ZoneCache($zoneTag:string,$start:Time,$end:Time) { viewer { zones(filter:{zoneTag:$zoneTag}) { rows:httpRequestsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end,requestSource:"eyeball"}) { count dimensions { cacheStatus } } } } }`;
  try {
    const payload = await gql(account, cacheQuery, { zoneTag:zone.id, start:window.start, end:window.end });
    const rows = payload?.data?.viewer?.zones?.[0]?.rows || [];
    result.cache.available = true;
    for (const row of rows) {
      const count = Number(row?.count || 0);
      const status = String(row?.dimensions?.cacheStatus || '').toLowerCase();
      if (['hit','revalidated','updating','stale'].includes(status)) result.cache.hit += count;
      else if (['miss','expired'].includes(status)) result.cache.miss += count;
      else if (['bypass','dynamic'].includes(status)) result.cache.bypass += count;
      else result.cache.other += count;
    }
  } catch (error) { result.warnings.push(`cache:${String(error.message).slice(0,120)}`); }
  return result;
}

async function schedulePressure(account, scripts) {
  const top = scripts.filter(item => item.script !== 'unknown').slice(0, 25);
  const rows = [];
  for (const item of top) {
    try {
      const payload = await cf(account, `/accounts/${encodeURIComponent(account.accountId)}/workers/scripts/${encodeURIComponent(item.script)}/schedules`);
      const schedules = payload?.result?.schedules || payload?.result || [];
      const crons = (Array.isArray(schedules) ? schedules : []).map(value => String(value?.cron || '')).filter(Boolean);
      if (crons.length) rows.push({ script:item.script, crons, everyMinute:crons.some(cron => /^\*\s+\*\s+\*\s+\*\s+\*$/.test(cron) || /^\*\/1\s/.test(cron)) });
    } catch {
      // Read-only diagnosis should not fail if schedule permission is narrower than analytics permission.
    }
  }
  return rows;
}

function accountSummary(account, usage, zones, traffic, schedules, products) {
  const totalZoneRequests = traffic.reduce((sum,row)=>sum+row.requests,0);
  const botRequests = traffic.reduce((sum,row)=>sum+row.botRequests,0);
  const internalRequests = traffic.reduce((sum,row)=>sum+row.internalRequests,0);
  const healthRequests = traffic.reduce((sum,row)=>sum+row.healthRequests,0);
  const devToProdSuspectRequests = traffic.reduce((sum,row)=>sum+row.devToProdSuspectRequests,0);
  const cache = traffic.reduce((sum,row) => {
    if (!row.cache.available) return sum;
    sum.availableZones += 1;
    sum.hit += row.cache.hit; sum.miss += row.cache.miss; sum.bypass += row.cache.bypass; sum.other += row.cache.other;
    return sum;
  }, { availableZones:0, hit:0, miss:0, bypass:0, other:0 });
  const cacheKnown = cache.hit + cache.miss + cache.bypass;
  const uaAvailableZones=traffic.filter(row=>!row.warnings.some(warning=>warning.startsWith('ua:'))).length;
  const healthAvailableZones=traffic.filter(row=>!row.warnings.some(warning=>warning.startsWith('health:'))).length;
  const cacheAvailableZones=traffic.filter(row=>row.cache.available&&!row.warnings.some(warning=>warning.startsWith('cache:'))).length;
  const zoneCoverageTotal=traffic.length;
  const hostCounts=new Map();
  for(const row of traffic)for(const item of row.hostRequests||[])hostCounts.set(item.host,(hostCounts.get(item.host)||0)+Number(item.requests||0));
  const topHosts=[...hostCounts].map(([host,requests])=>({host,requests})).sort((a,b)=>b.requests-a.requests).slice(0,15);
  const worstSubrequest = usage.scripts.reduce((best,item)=>item.subrequestRatio > (best?.subrequestRatio || 0) ? item : best, null);
  const prodResidues = account.label === 'PROD'
    ? usage.scripts.filter(item => /(?:^|[-_])(staging|development|dev)(?:$|[-_])/i.test(item.script) && item.requests > 0)
    : [];
  return {
    label:account.label,
    accountIdMasked:account.accountId ? `${account.accountId.slice(0,4)}...${account.accountId.slice(-4)}` : '',
    workers:{ ...usage, top:usage.scripts.slice(0,15) }, products, zones:zones.map(zone=>zone.name), topHosts, traffic,
    signals:{
      bot:{ available:uaAvailableZones>0, coverage:`${uaAvailableZones}/${zoneCoverageTotal}`, partial:uaAvailableZones>0&&uaAvailableZones<zoneCoverageTotal, requests:botRequests, percent:pct(botRequests,totalZoneRequests), severity:uaAvailableZones>0 ? severity(pct(botRequests,totalZoneRequests),30,60) : 'unknown' },
      loopRetry:{ maxSubrequestRatio:worstSubrequest?.subrequestRatio || 0, script:worstSubrequest?.script || '', severity:severity(worstSubrequest?.subrequestRatio || 0,3,8) },
      cache:{ available:cacheAvailableZones>0, coverage:`${cacheAvailableZones}/${zoneCoverageTotal}`, partial:cacheAvailableZones>0&&cacheAvailableZones<zoneCoverageTotal, hit:cache.hit, miss:cache.miss, bypass:cache.bypass, hitPercent:pct(cache.hit,cacheKnown), pressurePercent:pct(cache.miss+cache.bypass,cacheKnown), severity:cacheAvailableZones>0 ? severity(pct(cache.miss+cache.bypass,cacheKnown),60,85) : 'unknown' },
      cronHealth:{ healthAvailable:healthAvailableZones>0, coverage:`${healthAvailableZones}/${zoneCoverageTotal}`, partial:healthAvailableZones>0&&healthAvailableZones<zoneCoverageTotal, healthRequests, healthPercent:pct(healthRequests,totalZoneRequests), scheduledScripts:schedules.length, everyMinuteScripts:schedules.filter(row=>row.everyMinute).map(row=>row.script), severity:healthAvailableZones>0 ? (schedules.some(row=>row.everyMinute) || pct(healthRequests,totalZoneRequests)>=10 ? 'warning' : 'ok') : 'unknown' },
      boundary:{ available:uaAvailableZones>0, coverage:`${uaAvailableZones}/${zoneCoverageTotal}`, partial:uaAvailableZones>0&&uaAvailableZones<zoneCoverageTotal, internalRequests, internalPercent:pct(internalRequests,totalZoneRequests), devToProdSuspectRequests, prodStagingResidues:prodResidues.map(item=>item.script), severity:prodResidues.length || devToProdSuspectRequests > 0 ? 'critical' : (uaAvailableZones>0 ? (account.label==='PROD' && pct(internalRequests,totalZoneRequests)>=10 ? 'warning' : 'ok') : 'unknown') },
    },
  };
}

function icon(level) {
  if (level === 'critical') return '[CRIT]';
  if (level === 'warning') return '[WARN]';
  if (level === 'unknown') return '[N/A]';
  return '[OK]';
}
function fmt(value) {
  return Number(value || 0).toLocaleString('en-US');
}
function ratioText(numerator, denominator) {
  if (!denominator) return numerator ? 'n/a (DEV=0)' : '0x';
  return `${safeRatio(numerator, denominator)}x`;
}
function productMetric(product, key) {
  return product?.available ? fmt(product[key]) : 'N/A';
}
function workerStatusText(item) {
  const values = item?.nonOkStatuses || [];
  return values.length ? values.slice(0,3).map(([status,count])=>`${status}:${fmt(count)}`).join(', ') : 'none';
}
function topD1Text(product, databases=product?.databases) {
  if (!product?.available) return `N/A (${product?.warning || 'analytics unavailable'})`;
  const top = databases?.[0];
  if (!top) return '0 rows read';
  return `${fmt(top.rowsRead)} rows at ${top.database} (${fmt(top.rowsReadPerReadQuery)} rows/read query)`;
}
function currentD1Metric(product) {
  return product?.available ? fmt(product.currentDate?.rowsRead) : 'N/A';
}
function topKVText(product) {
  if (!product?.available) return `N/A (${product?.warning || 'analytics unavailable'})`;
  return (product.actions || []).slice(0,4).map(row=>`${row.action}:${fmt(row.requests)}`).join(', ') || 'none';
}
function topR2Text(product) {
  if (!product?.available) return `N/A (${product?.warning || 'analytics unavailable'})`;
  return (product.operations || []).slice(0,4).map(row=>`${row.bucket}/${row.action}/${row.status}:${fmt(row.requests)}`).join(', ') || 'none';
}
function markdown(report) {
  const lines = [
    '# EKODI Cloudflare Usage Root Cause Diagnose v2',
    '',
    `Worker/R2 window: ${report.window.start} -> ${report.window.end}`,
    'D1/KV/Durable Objects use Cloudflare calendar-date analytics covering the UTC dates touched by that window.',
    '',
    '| Account | Worker requests | D1 rows read since 00:00 UTC | KV ops | R2 ops | DO invocations | Bot | Boundary |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of report.accounts) {
    const s = row.signals;
    lines.push(`| ${row.label} | ${fmt(row.workers.requests)} | ${currentD1Metric(row.products?.d1)} | ${productMetric(row.products?.kv,'requests')} | ${productMetric(row.products?.r2,'requests')} | ${productMetric(row.products?.durableObjects,'requests')} | ${s.bot.available ? `${s.bot.percent}%` : 'N/A'} | ${s.boundary.available ? `${s.boundary.devToProdSuspectRequests} suspect` : 'N/A'} |`);
  }
  const prodRow = report.accounts.find(row=>row.label==='PROD');
  const devRow = report.accounts.find(row=>row.label==='DEV');
  if (prodRow && devRow) {
    lines.push('', '## PROD / DEV ratios', '', '| Metric | Ratio |', '|---|---:|',
      `| Worker requests | ${ratioText(prodRow.workers.requests,devRow.workers.requests)} |`,
      `| D1 rows read since 00:00 UTC | ${ratioText(prodRow.products?.d1?.currentDate?.rowsRead,devRow.products?.d1?.currentDate?.rowsRead)} |`,
      `| D1 rows read across touched UTC dates | ${ratioText(prodRow.products?.d1?.rowsRead,devRow.products?.d1?.rowsRead)} |`,
      `| KV operations | ${ratioText(prodRow.products?.kv?.requests,devRow.products?.kv?.requests)} |`,
      `| R2 operations | ${ratioText(prodRow.products?.r2?.requests,devRow.products?.r2?.requests)} |`,
      `| Durable Object invocations | ${ratioText(prodRow.products?.durableObjects?.requests,devRow.products?.durableObjects?.requests)} |`);
  }
  lines.push('', '## Five checks');
  for (const row of report.accounts) {
    const s = row.signals;
    const d1 = row.products?.d1;
    const kv = row.products?.kv;
    const r2 = row.products?.r2;
    const durable = row.products?.durableObjects;
    const worst = row.workers.scripts.find(item=>item.script===s.loopRetry.script) || row.workers.top?.[0];
    lines.push('', `### ${row.label}`,
      `1. Workers: ${fmt(row.workers.requests)} requests, ${safeRatio(row.workers.subrequests,row.workers.requests)} subrequests/request overall; max ${s.loopRetry.maxSubrequestRatio}x at \`${s.loopRetry.script || 'n/a'}\`; invocation errors ${fmt(row.workers.errors)}. Top non-ok statuses: ${workerStatusText(worst)}.`,
      `2. D1: ${d1?.available ? `since 00:00 UTC ${fmt(d1.currentDate?.rowsRead)} rows read / ${fmt(d1.currentDate?.readQueries)} read queries / ${fmt(d1.currentDate?.rowsWritten)} rows written. Top current-day database: ${topD1Text(d1,d1.currentDate?.databases)}. Touched-date total: ${fmt(d1.rowsRead)} rows.` : topD1Text(d1)}`,
      `3. KV/R2/DO: KV ${kv?.available ? `${fmt(kv.requests)} ops (${topKVText(kv)})` : topKVText(kv)}; R2 ${r2?.available ? `${fmt(r2.requests)} ops, ${fmt(r2.errorRequests)} error ops (${topR2Text(r2)})` : topR2Text(r2)}; Durable Objects ${durable?.available ? `${fmt(durable.requests)} invocations` : `N/A (${durable?.warning || 'analytics unavailable'})`}. Edge cache pressure ${s.cache.available ? `${s.cache.pressurePercent}%` : 'N/A'}.`,
      `4. Bots/Cron/Health: bots ${s.bot.available ? `${fmt(s.bot.requests)} (${s.bot.percent}%)` : 'N/A'} across zones ${s.bot.coverage}; health ${s.cronHealth.healthAvailable ? `${fmt(s.cronHealth.healthRequests)} (${s.cronHealth.healthPercent}%)` : 'N/A'}; every-minute schedules ${s.cronHealth.everyMinuteScripts.join(', ') || 'none'}.`,
      `5. DEV->PROD boundary: suspect requests ${fmt(s.boundary.devToProdSuspectRequests)}, internal ${s.boundary.available ? `${fmt(s.boundary.internalRequests)} (${s.boundary.internalPercent}%)` : 'N/A'}, PROD staging residue ${s.boundary.prodStagingResidues.join(', ') || 'none'}.`,
      '', 'Top Workers:',
      ...row.workers.top.slice(0,10).map(item => `- ${fmt(item.requests)} req | ${item.subrequestRatio}x subreq | ${item.errorPercent}% errors | status ${workerStatusText(item)} | cpuP99 raw ${item.cpuP99} | \`${item.script}\``),
      '', 'Top Hosts (covered Zone Analytics):',
      ...(row.topHosts.length ? row.topHosts.slice(0,10).map(item=>`- ${fmt(item.requests)} requests | ${item.host}`) : ['- n/a'])
    );
  }
  lines.push('', '> This report is read-only. Product analytics availability depends on token permissions and dataset availability. Calendar-date datasets are not treated as exact 24-hour counters.');
  return `${lines.join('\n')}\n`;
}

async function inspect(account, window) {
  if (!account.accountId || !account.token) throw new Error(`${account.label}: missing Cloudflare credentials`);
  const usage = await workerUsage(account, window);
  let zones = [];
  try { zones = await activeZones(account); } catch {}
  const traffic = [];
  for (const zone of zones) traffic.push(await zoneTraffic(account, zone, window));
  const [schedules, products] = await Promise.all([
    schedulePressure(account, usage.scripts),
    collectProductUsage(account, window, gql, cf),
  ]);
  return accountSummary(account, usage, zones, traffic, schedules, products);
}

async function main() {
  const window = windowUtc();
  const accounts = [];
  for (const account of [prod, dev]) accounts.push(await inspect(account, window));
  const report = { schemaVersion:2, generatedAt:new Date().toISOString(), window, accounts };
  await fs.writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(outputMd, markdown(report), 'utf8');
  console.log(markdown(report));
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
