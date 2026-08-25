import { cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));

const [healthJs, healthCss, mapJs, mapCss] = await Promise.all([
  readFile(`${output}system-health-admin.js`, 'utf8'),
  readFile(`${output}system-health-admin.css`, 'utf8'),
  readFile(`${root}system-map-admin.js`, 'utf8'),
  readFile(`${root}system-map-admin.css`, 'utf8'),
]);

if (!mapJs.includes('EKODISystemMap')) throw new Error('System Map runtime marker missing');
if (!mapJs.includes("fetch('/platform-boundaries.json'")) throw new Error('System Map must read platform-boundaries.json');
if (!mapJs.includes("fetch('/monitor-status.json'")) throw new Error('System Map must read monitor-status.json');
if (mapJs.includes('setInterval(')) throw new Error('System Map must stay event-driven');

await Promise.all([
  writeFile(`${output}system-health-admin.js`, `${healthJs}\n${mapJs}\n`),
  writeFile(`${output}system-health-admin.css`, `${healthCss}\n${mapCss}\n`),
  cp(`${root}platform-boundaries.json`, `${output}platform-boundaries.json`),
]);

console.log('Admin System Map appended to lazy Health bundle with platform boundaries + monitor status sources.');
