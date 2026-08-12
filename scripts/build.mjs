import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html',
  'admin.html',
  'control-center.html',
  'control-center.css',
  'control-center-ops.css',
  'control-center-finance.css',
  'control-center.js',
  'finance-monitor.js',
  'hub.html',
  'trade.html',
  'styles.css',
  'script.js',
  'monitor-status.json',
  '_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

const responsiveCss = await readFile(`${root}responsive.css`, 'utf8');
const htmlAssets = assets.filter(asset => asset.endsWith('.html'));
for (const asset of htmlAssets) {
  const path = `${output}${asset}`;
  const html = await readFile(path, 'utf8');
  if (!html.includes('data-ekodi-responsive')) {
    const responsiveStyle = `<style data-ekodi-responsive>\n${responsiveCss}\n</style>\n`;
    await writeFile(path, html.replace('</head>', `${responsiveStyle}</head>`));
  }
}

console.log(`Built EKODI root, Control Center, hub and trade assets with responsive typography: ${assets.join(', ')}`);
