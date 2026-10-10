#!/usr/bin/env node
/**
 * Cloudflare D1 control-plane read-only inventory.
 * Never logs, persists, or exposes API tokens and database UUIDs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';

export async function verifyProviderD1({
  fetchImpl = fetch, accountId, token, expectedNames, maxPages = 10,
} = {}) {
  const report = {
    policy:'EKODI-DATA-STORE-TOPOLOGY-001', checkedAt:new Date().toISOString(),
    provider:'cloudflare-d1', controlPlane:'authenticated-read-only', resourceIdentifiersExposed:false,
    ok:false, circuitOpen:false, registered:[], observedTotal:null,
  };
  const names = [...new Set(expectedNames ?? [])];
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token ||
      !names.length || names.some(x => !/^[a-z0-9-]{1,64}$/i.test(x))) {
    return { ...report, error:'missing-or-invalid-provider-configuration' };
  }
  const discovered = new Set();
  for (let page = 1; page <= maxPages; page++) {
    let response;
    try {
      response = await fetchImpl(API + '/accounts/' + accountId +
        '/d1/database?per_page=100&page=' + page, {
        method:'GET', redirect:'error',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal:AbortSignal.timeout(9000),
      });
    } catch { return { ...report, error:'cloudflare-control-plane-unreachable' }; }
    if (response.status === 429) return { ...report, circuitOpen:true, error:'quota-protection' };
    if (!response.ok) return { ...report, error:'cloudflare-control-plane-rejected', httpStatus:response.status };
    const json = await response.json().catch(() => null);
    if (json?.success !== true || !Array.isArray(json.result))
      return { ...report, error:'cloudflare-control-plane-unexpected-response' };
    for (const item of json.result) if (typeof item.name === 'string') discovered.add(item.name);
    if (Number.isInteger(json.result_info?.total_count)) report.observedTotal = json.result_info.total_count;
    if (json.result.length < 100) break;
    if (page === maxPages) return { ...report, error:'cloudflare-control-plane-inventory-incomplete' };
  }
  report.registered = names.map(name => ({ name, present:discovered.has(name) }));
  report.ok = report.registered.every(item => item.present);
  if (!report.ok) report.error = 'registered-d1-database-missing';
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv.find(a => a.startsWith('--output='))?.slice('--output='.length);
  try {
    const topology = JSON.parse(await readFile(new URL('../config/data-store-topology.json', import.meta.url),'utf8'));
    const names = topology.stores.filter(x => x.engine === 'cloudflare-d1').map(x => x.expectedName);
    const result = await verifyProviderD1({
      token:process.env.CLOUDFLARE_API_TOKEN,
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      expectedNames:names,
    });
    const printable = JSON.stringify(result, null, 2) + '\n';
    if (output) await writeFile(output,printable,'utf8');
    process.stdout.write(printable);
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ ok:false, error:'provider-inventory-failed' }));
    process.exitCode = 1;
  }
}
