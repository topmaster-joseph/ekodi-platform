import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await import('./admin-thin-postbuild-core.mjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
await cp(`${root}admin-public-site-controls.js`, `${dist}admin-public-site-controls.js`);

console.log('Published EKODI super-admin login provider control asset.');
