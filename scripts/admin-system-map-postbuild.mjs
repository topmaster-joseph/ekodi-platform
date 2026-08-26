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
if (!mapJs.includes("fetch('/ecosystem-services.json'")) throw new Error('System Map must read ecosystem-services.json');
if (mapJs.includes('setInterval(')) throw new Error('System Map must stay event-driven');

const storageAwareMapJs = mapJs.replace(
  "    ['R2', 'Durable Storage', '파일 · 장기 백업'],",
  "    ['Google Drive', 'Archive Storage', '원본 · 문서 · 미디어 · 장기보관'],\n    ['R2', 'Web Object Storage', '웹 배포 파일 · 백업 복제본'],",
);
if (!storageAwareMapJs.includes("['Google Drive', 'Archive Storage'")) throw new Error('System Map Google Drive storage role missing');

await Promise.all([
  writeFile(`${output}system-health-admin.js`, `${healthJs}\n${storageAwareMapJs}\n`),
  writeFile(`${output}system-health-admin.css`, `${healthCss}\n${mapCss}\n`),
  cp(`${root}platform-boundaries.json`, `${output}platform-boundaries.json`),
  cp(`${root}config/ecosystem-services.json`, `${output}ecosystem-services.json`),
  cp(`${root}storage-admin.js`, `${output}storage-admin.js`),
  cp(`${root}storage-admin.css`, `${output}storage-admin.css`),
]);

console.log('Admin System Structure Overview + Drive-first Storage assets prepared with canonical boundary and service registry data.');
