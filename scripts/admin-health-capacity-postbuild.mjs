import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const capacityMarker = 'ekodiCapacityEvidence';
const autonomousMarker = 'EKODIAutonomousHealth';

const [capacityJs, capacityCss, autonomousJs, autonomousCss, healthJs, healthCss] = await Promise.all([
  readFile(`${root}system-capacity-admin.js`, 'utf8'),
  readFile(`${root}system-capacity-admin.css`, 'utf8'),
  readFile(`${root}autonomous-health-admin.js`, 'utf8'),
  readFile(`${root}autonomous-health-admin.css`, 'utf8'),
  readFile(`${dist}system-health-admin.js`, 'utf8'),
  readFile(`${dist}system-health-admin.css`, 'utf8'),
]);

new Function(capacityJs);
new Function(autonomousJs);
if (healthJs.includes(capacityMarker)) throw new Error('Health capacity evidence already appended');
if (healthJs.includes(autonomousMarker)) throw new Error('Autonomous health panel already appended');
if (!capacityJs.includes('CAPACITY EVIDENCE') || !capacityJs.includes('근거 보기 ↗')) {
  throw new Error('Health capacity evidence contract is incomplete');
}
if (!capacityCss.includes('.health-capacity-evidence')) {
  throw new Error('Health capacity evidence styles are missing');
}
if (!autonomousJs.includes('근거 없는 점수는 표시하지 않습니다.')) {
  throw new Error('Autonomous health transparency contract is missing');
}
if (!autonomousCss.includes('.autonomous-health-panel')) {
  throw new Error('Autonomous health styles are missing');
}

await Promise.all([
  writeFile(`${dist}system-health-admin.js`, `${healthJs.trim()}\n${capacityJs.trim()}\n${autonomousJs.trim()}\n`),
  writeFile(`${dist}system-health-admin.css`, `${healthCss.trim()}\n${capacityCss.trim()}\n${autonomousCss.trim()}\n`),
]);

console.log('Admin Health capacity evidence and Generation 10 autonomous health panel appended to the existing demand-loaded Health assets.');
