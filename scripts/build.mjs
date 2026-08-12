import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html',
  'admin.html',
  'hub.html',
  'styles.css',
  'script.js',
  'control-center-bootstrap.js',
  'monitor-status.json',
  '_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

const adminPath = `${output}admin.html`;
const adminHtml = await readFile(adminPath, 'utf8');
const scriptTag = '<script src="script.js"></script>';
if (!adminHtml.includes(scriptTag)) throw new Error('admin.html script entry point not found');
await writeFile(
  adminPath,
  adminHtml.replace(scriptTag, '<script src="control-center-bootstrap.js"></script>\n  ' + scriptTag),
  'utf8'
);

console.log(`Built EKODI root and control-center assets: ${assets.join(', ')}`);
