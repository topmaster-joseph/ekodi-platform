import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPayload, checkSite, shouldPublish, SITE_DEFINITIONS } from './monitor-lib.mjs';

const outputPath = fileURLToPath(new URL('../monitor-status.json', import.meta.url));
const concurrency = 8;

async function checkAllSites(sites) {
  const results = new Array(sites.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= sites.length) return;
      results[index] = await checkSite(sites[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, sites.length) }, () => worker()));
  return results;
}

const results = await checkAllSites(SITE_DEFINITIONS);
const payload = buildPayload(results);
let previous = null;

try {
  previous = JSON.parse(await readFile(outputPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.warn(`Ignoring invalid previous status: ${error.message}`);
}

if (shouldPublish(previous, payload)) {
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ published: true, concurrency, ...payload.summary }));
} else {
  console.log(JSON.stringify({ published: false, reason: 'no operational change', concurrency, ...payload.summary }));
}
