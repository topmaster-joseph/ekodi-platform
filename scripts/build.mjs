import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadHomepageServices, renderServiceCards } from './ecosystem-registry.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html','admin.html','control-center.html','control-center.css','control-center-ops.css','control-center-finance.css','control-center.js','control-center-features.js','admin-central-handoff.js','finance-monitor.js','client-access.css','client-access.js','marketing-funnel-admin.css','marketing-funnel-admin.js','google-admin-auth.css','google-admin-auth.js','domains-hub.css','domains-hub.js','social-admin.css','social-admin.js','release-control-admin.css','release-control-admin.js','community-reports-admin.css','community-reports-admin.js','books-admin.css','books-admin.js','books-finance-admin.css','books-finance-admin.js','compact-control-center.css','compact-control-center.js','campus-actions.css','campus-actions.js','hub.html','trade.html','styles.css','script.js','monitor-status.json','_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

// Books finance, distribution, lifecycle pipeline and royalties share one secured lazy asset.
// This keeps the first paint small while ensuring all Books operations load together.
const [financeCss, distributionCss, pipelineCss, royaltyCss, financeJs, distributionJs, pipelineJs, pipelineBridgeJs, royaltyJs] = await Promise.all([
  readFile(`${output}books-finance-admin.css`, 'utf8'),
  readFile(`${root}books-distribution-admin.css`, 'utf8'),
  readFile(`${root}books-pipeline-admin.css`, 'utf8'),
  readFile(`${root}books-royalty-admin.css`, 'utf8'),
  readFile(`${output}books-finance-admin.js`, 'utf8'),
  readFile(`${root}books-distribution-admin.js`, 'utf8'),
  readFile(`${root}books-pipeline-admin.js`, 'utf8'),
  readFile(`${root}books-pipeline-bridge.js`, 'utf8'),
  readFile(`${root}books-royalty-admin.js`, 'utf8'),
]);
await writeFile(`${output}books-finance-admin.css`, `${financeCss}\n${distributionCss}\n${pipelineCss}\n${royaltyCss}\n`);
await writeFile(`${output}books-finance-admin.js`, `${financeJs}\n${distributionJs}\n${pipelineJs}\n${pipelineBridgeJs}\n${royaltyJs}\n`);

// auth.ekodi.kr is served by the existing site Worker, so flatten its dedicated
// assets into dist rather than creating a competing Pages custom-domain route.
await cp(`${root}auth-site/index.html`, `${output}auth-center.html`);
for (const asset of ['auth.css', 'auth.js', 'auth-router.js', 'admin-auth.js', 'client-auth.js', 'marketing-onboarding.js', 'membership-ui.js']) {
  await cp(`${root}auth-site/${asset}`, `${output}${asset}`);
}

const homepageServices = await loadHomepageServices();
const homepageCards = renderServiceCards(homepageServices);
const responsiveCss = await readFile(`${root}responsive.css`, 'utf8');
const htmlAssets = [...assets.filter(asset => asset.endsWith('.html')), 'auth-center.html'];
for (const asset of htmlAssets) {
  const path = `${output}${asset}`;
  let html = await readFile(path, 'utf8');

  if (asset === 'index.html') {
    const serviceGrid = /<div class="service-grid">[\s\S]*?(\n\s*<\/div>\n\s*<\/div>\n\s*<\/section>)/;
    if (!serviceGrid.test(html)) throw new Error('EKODI homepage service grid marker not found');
    html = html.replace(serviceGrid, `<div class="service-grid" data-ekodi-service-registry="v1">\n${homepageCards}$1`);

    html = html
      .replaceAll('EKODI선교회', '에코디커뮤니티')
      .replaceAll('에코디선교회', '에코디커뮤니티')
      .replaceAll('https://youtube.com/@ekodicommunity', 'https://community.ekodi.kr')
      .replaceAll('https://www.youtube.com/@ekodicommunity', 'https://community.ekodi.kr');
    if (html.includes('EKODI선교회') || html.includes('에코디선교회')) throw new Error('Legacy EKODI mission brand remains on homepage');
  }

  if (!html.includes('data-ekodi-responsive')) {
    const responsiveStyle = `<style data-ekodi-responsive>\n${responsiveCss}\n</style>\n`;
    html = html.replace('</head>', `${responsiveStyle}</head>`);
  }
  if (asset === 'control-center.html') {
    html = html.replace(/\s*<script src="finance-monitor\.js"><\/script>\s*/g, '\n');
    if (!html.includes('data-section="release"')) {
      const activityLink = '        <a class="nav" href="/legacy#activity">≡ <span>운영 기록</span></a>';
      if (!html.includes(activityLink)) throw new Error('Admin sidebar activity marker not found for Release navigation');
      html = html.replace(activityLink, `        <button class="nav" data-section="release" type="button">◆ <span>Release</span></button>\n${activityLink}`);
    }
    if (!html.includes('compact-control-center.css')) html = html.replace('</head>', '<link rel="stylesheet" href="compact-control-center.css">\n</head>');
    if (!html.includes('campus-actions.css')) html = html.replace('</head>', '<link rel="stylesheet" href="campus-actions.css">\n</head>');
    if (!html.includes('release-control-admin.css')) html = html.replace('</head>', '<link rel="stylesheet" href="release-control-admin.css">\n</head>');
    if (!html.includes('compact-control-center.js')) html = html.replace('</body>', '<script src="compact-control-center.js" defer></script>\n</body>');
    if (!html.includes('control-center-features.js')) html = html.replace('</body>', '<script src="control-center-features.js" defer></script>\n</body>');
    if (!html.includes('campus-actions.js')) html = html.replace('</body>', '<script src="campus-actions.js" defer></script>\n</body>');
    if (!html.includes('release-control-admin.js')) html = html.replace('</body>', '<script src="release-control-admin.js" defer></script>\n</body>');
  }
  await writeFile(path, html);
}

console.log(`Built EKODI root with ${homepageServices.length} registry-driven homepage services, lightweight Control Center shell, auth hub, service hubs and trade assets: ${assets.join(', ')}`);
