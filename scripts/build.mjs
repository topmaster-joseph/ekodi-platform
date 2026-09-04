import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await import('./build-core.mjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
await cp(`${root}admin-public-site-controls.js`, `${output}admin-public-site-controls.js`);

console.log('Added EKODI super-admin login provider control asset.');
