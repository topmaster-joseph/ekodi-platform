import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadHomepageServices, renderServiceCards } from './ecosystem-registry.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html','homepage-ambient.css','homepage-ambient.js','admin.html','control-center.html','control-center.css','control-center-ops.css','control-center-finance.css','control-center.js','control-center-features.js','admin-central-handoff.js','admin-authenticated-shell.js','admin-menu-layout.js','finance-monitor.js','client-access.css','client-access.js','marketing-funnel-admin.css','marketing-funnel-admin.js','marketing-ai-admin.css','marketing-ai-admin.js','google-admin-auth.css','google-admin-auth.js','domains-hub.css','domains-hub.js','social-admin.css','social-admin.js','release-control-admin.css','release-control-admin.js','community-reports-admin.css','community-reports-admin.js','books-admin.css','books-admin.js','books-finance-admin.css','books-finance-admin.js','compact-control-center.css','compact-control-center.js','campus-actions.css','campus-actions.js','ai-ops-admin.css','ai-ops-admin.js','work-admin.css','work-admin.js','admin-lazy-features.js','ekodi-device-bootstrap.cmd','hub.html','trade.html','styles.css','script.js','monitor-status.json','_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

// MarketingAI admin keeps one authenticated lazy asset, while live operations views
// remain independently maintainable source modules. Bundle them after the base console.
const [marketingAdminCss, marketingAdminJs, marketingLiveCss, marketingLiveJs] = await Promise.all([
  readFile(`${output}marketing-ai-admin.css`, 'utf8'),
  readFile(`${output}marketing-ai-admin.js`, 'utf8'),
  readFile(`${root}marketing-ai-admin-live-ops.css`, 'utf8'),
  readFile(`${root}marketing-ai-admin-live-ops.js`, 'utf8'),
]);
await writeFile(`${output}marketing-ai-admin.css`, `${marketingAdminCss}\n${marketingLiveCss}\n`);
await writeFile(`${output}marketing-ai-admin.js`, `${marketingAdminJs}\n${marketingLiveJs}\n`);

// Device Control is privileged post-auth functionality. Bundle it into the existing
// compact authenticated assets so admin.ekodi.kr does not expose another pre-auth script.
const [compactCss, compactJs, deviceControlCss, deviceControlJs] = await Promise.all([
  readFile(`${output}compact-control-center.css`, 'utf8'),
  readFile(`${output}compact-control-center.js`, 'utf8'),
  readFile(`${root}device-control-admin.css`, 'utf8'),
  readFile(`${root}device-control-admin.js`, 'utf8'),
]);
await writeFile(`${output}compact-control-center.css`, `${compactCss}\n${deviceControlCss}\n`);
await writeFile(`${output}compact-control-center.js`, `${compactJs}\n${deviceControlJs}\n`);

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
for (const asset of ['auth.css', 'auth.js', 'auth-router.js', 'marketing-auth-hotfix.js', 'auth-workspace-target.js', 'admin-auth.js', 'client-auth.js', 'author-auth.js', 'marketing-onboarding.js', 'membership-ui.js']) {
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

    if (!html.includes('homepage-ambient.css')) {
      html = html.replace('</head>', '<link rel="stylesheet" href="/homepage-ambient.css">\n</head>');
    }
    if (!html.includes('homepage-ambient.js')) {
      html = html.replace('</body>', '<script src="/homepage-ambient.js" defer></script>\n</body>');
    }
  }

  if (!html.includes('data-ekodi-responsive')) {
    const responsiveStyle = `<style data-ekodi-responsive>\n${responsiveCss}\n</style>\n`;
    html = html.replace('</head>', `${responsiveStyle}</head>`);
  }
  if (asset === 'control-center.html') {
    html = html.replace(/\s*<script src="finance-monitor\.js"><\/script>\s*/g, '\n');
    // Pre-auth must stay a tiny, dependable login shell. Campus, feature navigation,
    // Chief AI and other admin modules are loaded only after control-center.js has
    // validated a real administrator session and revealed #app.
    html = html.replace(/\s*<link rel="stylesheet" href="(?:compact-control-center|campus-actions)\.css">\s*/g, '\n');
    html = html.replace(/\s*<script src="(?:compact-control-center|control-center-features|campus-actions|admin-lazy-features)\.js"[^>]*><\/script>\s*/g, '\n');
    if (!html.includes('admin-authenticated-shell.js')) {
      html = html.replace('</body>', '<script src="admin-authenticated-shell.js?v=20260816-preauth-1" defer data-ekodi-postauth="compact-control-center.js control-center-features.js campus-actions.js admin-lazy-features.js admin-menu-layout.js ai-ops-admin.js ai-ops-admin.css release-control-admin.js release-control-admin.css work-admin.js work-admin.css marketing-ai-admin.js marketing-ai-admin.css"></script>\n</body>');
    }
  }
  await writeFile(path, html);
}

console.log(`Built EKODI root with ${homepageServices.length} registry-driven homepage services, minimal pre-auth Control Center, authenticated Campus/Chief AI/Device Control modules, MarketingAI live ops, device bootstrap, auth hub, service hubs and trade assets: ${assets.join(', ')}`);
