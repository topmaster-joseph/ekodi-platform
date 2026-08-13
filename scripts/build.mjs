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
  'admin-central-handoff.js',
  'finance-monitor.js',
  'client-access.css',
  'client-access.js',
  'marketing-funnel-admin.css',
  'marketing-funnel-admin.js',
  'google-admin-auth.css',
  'google-admin-auth.js',
  'compact-control-center.css',
  'compact-control-center.js',
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

// auth.ekodi.kr is served by the existing site Worker, so flatten its dedicated
// assets into dist rather than creating a competing Pages custom-domain route.
await cp(`${root}auth-site/index.html`, `${output}auth-center.html`);
for (const asset of ['auth.css', 'auth.js', 'auth-router.js', 'admin-auth.js', 'client-auth.js']) {
  await cp(`${root}auth-site/${asset}`, `${output}${asset}`);
}

const responsiveCss = await readFile(`${root}responsive.css`, 'utf8');
const htmlAssets = [...assets.filter(asset => asset.endsWith('.html')), 'auth-center.html'];
for (const asset of htmlAssets) {
  const path = `${output}${asset}`;
  let html = await readFile(path, 'utf8');
  if (!html.includes('data-ekodi-responsive')) {
    const responsiveStyle = `<style data-ekodi-responsive>\n${responsiveCss}\n</style>\n`;
    html = html.replace('</head>', `${responsiveStyle}</head>`);
  }
  if (asset === 'control-center.html') {
    if (!html.includes('client-access.css')) html = html.replace('</head>', '<link rel="stylesheet" href="client-access.css">\n</head>');
    if (!html.includes('marketing-funnel-admin.css')) html = html.replace('</head>', '<link rel="stylesheet" href="marketing-funnel-admin.css">\n</head>');
    if (!html.includes('google-admin-auth.css')) html = html.replace('</head>', '<link rel="stylesheet" href="google-admin-auth.css">\n</head>');
    if (!html.includes('compact-control-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="compact-control-center.css">\n</head>');
    if (!html.includes('client-access.js')) html = html.replace('</body>', '<script src="client-access.js" defer></script>\n</body>');
    if (!html.includes('marketing-funnel-admin.js')) html = html.replace('</body>', '<script src="marketing-funnel-admin.js" defer></script>\n</body>');
    if (!html.includes('google-admin-auth.js')) html = html.replace('</body>', '<script src="google-admin-auth.js" defer></script>\n</body>');
    if (!html.includes('compact-control-center.js')) html = html.replace('</body>', '<script src="compact-control-center.js" defer></script>\n</body>');
  }
  await writeFile(path, html);
}

console.log(`Built EKODI root, Control Center, auth hub, service hubs and trade assets with responsive typography: ${assets.join(', ')}`);
