import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html',
  'portal.css',
  'portal.js',
  'service-registry.json',
  'admin.html',
  'styles.css',
  'script.js',
  'monitor-status.json',
  '_headers'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));
console.log(`Built ${assets.length} production assets in ${output}`);
