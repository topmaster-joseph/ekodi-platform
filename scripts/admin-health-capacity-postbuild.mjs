import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const marker = 'ekodiCapacityEvidence';

const [capacityJs, capacityCss, healthJs, healthCss] = await Promise.all([
  readFile(`${root}system-capacity-admin.js`, 'utf8'),
  readFile(`${root}system-capacity-admin.css`, 'utf8'),
  readFile(`${dist}system-health-admin.js`, 'utf8'),
  readFile(`${dist}system-health-admin.css`, 'utf8'),
]);

new Function(capacityJs);
if (healthJs.includes(marker)) throw new Error('Health capacity evidence already appended');
if (!capacityJs.includes('CAPACITY EVIDENCE') || !capacityJs.includes('근거 보기 ↗')) {
  throw new Error('Health capacity evidence contract is incomplete');
}
if (!capacityCss.includes('.health-capacity-evidence')) {
  throw new Error('Health capacity evidence styles are missing');
}

await Promise.all([
  writeFile(`${dist}system-health-admin.js`, `${healthJs.trim()}\n${capacityJs.trim()}\n`),
  writeFile(`${dist}system-health-admin.css`, `${healthCss.trim()}\n${capacityCss.trim()}\n`),
]);

console.log('Admin Health capacity evidence appended to the existing demand-loaded Health assets.');
