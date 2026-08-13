import { cp, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

for (const asset of ['affiliate-admin.css', 'affiliate-admin.js']) {
  await cp(new URL(asset, root), new URL(asset, dist));
}

const controlPath = new URL('control-center.html', dist);
let html = await readFile(controlPath, 'utf8');
if (!html.includes('affiliate-admin.css')) {
  html = html.replace('</head>', '<link rel="stylesheet" href="affiliate-admin.css">\n</head>');
}
if (!html.includes('affiliate-admin.js')) {
  html = html.replace('</body>', '<script src="affiliate-admin.js" defer></script>\n</body>');
}
await writeFile(controlPath, html);
console.log('Added EKODI Affiliate module to Control Center build.');
