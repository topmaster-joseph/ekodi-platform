import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildPayload, checkSite, shouldPublish, SITE_DEFINITIONS } from './monitor-lib.mjs';

const outputPath = fileURLToPath(new URL('../monitor-status.json', import.meta.url));
const results = await Promise.all(SITE_DEFINITIONS.map(site => checkSite(site)));
const payload = buildPayload(results);
let previous = null;

try {
  previous = JSON.parse(await readFile(outputPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.warn(`Ignoring invalid previous status: ${error.message}`);
}

if (shouldPublish(previous, payload)) {
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ published: true, ...payload.summary }));
} else {
  console.log(JSON.stringify({ published: false, reason: 'no operational change', ...payload.summary }));
}
