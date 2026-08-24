import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadHomepageServices, renderServiceCards } from './ecosystem-registry.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html','history.html','homepage-ambient.css','homepage-ambient.js','admin.html','control-center.html','control-center.css','control-center-ops.css','control-center-finance.css','control-center.js','control-center-features.js','admin-central-handoff.js','admin-authenticated-shell.js','admin-demand-loader.js','admin-menu-layout.js','homepage-admin.js','admin-secret-generator.css','admin-secret-generator.js','finance-monitor.js','client-access.css','client-access.js','marketing-funnel-admin.css','marketing-funnel-admin.js','marketing-ai-admin.css','marketing-ai-admin.js','google-admin-auth.css','google-admin-auth.js','domains-hub.css','domains-hub.js','social-admin.css','social-admin.js','release-control-admin.css','release-control-admin.js','community-reports-admin.css','community-reports-admin.js','books-admin.css','books-admin.js','books-finance-admin.css','books-finance-admin.js','compact-control-center.css','compact-control-center.js','admin-readable-command.css','admin-readable-command.js','campus-actions.css','campus-actions.js','ai-ops-admin.css','ai-ops-admin.js','mission-control-admin.css','mission-control-admin.js','work-admin.css','work-admin.js','admin-lazy-features.js','author-billing-admin.css','author-billing-admin.js','system-health-admin.css','system-health-admin.js','ekodi-device-bootstrap.cmd','hub.html','trade.html','styles.css','script.js','monitor-status.json','_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

// User AI membership operations belong to AI Ops and should never increase the normal
// authenticated startup path. Keep the source modular, but bundle it into the existing
// demand-loaded AI Ops JavaScript asset at build time.
const [aiOpsBaseJs, userAiTierPanelJs] = await Promise.all([
  readFile(`${output}ai-ops-admin.js`, 'utf8'),
  readFile(`${root}user-ai-tier-panel.js`, 'utf8'),
]);
await writeFile(`${output}ai-ops-admin.js`, `${aiOpsBaseJs}\n${userAiTierPanelJs}\n`);

// The Admin AI provider control plane must reach production without adding another
// first-load asset. Bundle the same guarded module into both demand-loaded entry points:
// AI Ops for Chief/specialist routing and Security for Cloudflare account/zone/Worker context.
// The module self-deduplicates through window.EKODIAdminAIControlPlane when both are opened.
const adminAiControlPlaneJs = await readFile(`${root}admin-ai-control-plane.js`, 'utf8');
const [aiOpsWithTierJs, secretGeneratorBaseJs] = await Promise.all([
  readFile(`${output}ai-ops-admin.js`, 'utf8'),
  readFile(`${output}admin-secret-generator.js`, 'utf8'),
]);
if (!adminAiControlPlaneJs.includes('EKODIAdminAIControlPlane')) {
  throw new Error('Admin AI control plane marker missing');
}
await Promise.all([
  writeFile(`${output}ai-ops-admin.js`, `${aiOpsWithTierJs}\n${adminAiControlPlaneJs}\n`),
  writeFile(`${output}admin-secret-generator.js`, `${secretGeneratorBaseJs}\n${adminAiControlPlaneJs}\n`),
]);

// Tax invoices are a Finance sub-workspace, not a new public edge asset. Bundle the
// dedicated source modules into the already secured Finance assets so the existing
// admin allowlist, CSP and lazy-loading boundary remain unchanged.
const [financeBaseCss, financeBaseJs, taxInvoiceCss, taxInvoiceJs] = await Promise.all([
  readFile(`${output}control-center-finance.css`, 'utf8'),
  readFile(`${output}finance-monitor.js`, 'utf8'),
  readFile(`${root}tax-invoice-admin.css`, 'utf8'),
  readFile(`${root}tax-invoice-admin.js`, 'utf8'),
]);
await writeFile(`${output}control-center-finance.css`, `${financeBaseCss}\n${taxInvoiceCss}\n`);
await writeFile(`${output}finance-monitor.js`, `${financeBaseJs}\n${taxInvoiceJs}\n`);

// MarketingAI admin keeps one authenticated on-demand asset, while live operations views
// remain independently maintainable source modules. Bundle them after the base console.
const [marketingAdminCss, marketingAdminJs, marketingLiveCss, marketingLiveJs] = await Promise.all([
  readFile(`${output}marketing-ai-admin.css`, 'utf8'),
  readFile(`${output}marketing-ai-admin.js`, 'utf8'),
  readFile(`${root}marketing-ai-admin-live-ops.css`, 'utf8'),
  readFile(`${root}marketing-ai-admin-live-ops.js`, 'utf8'),
]);
await writeFile(`${output}marketing-ai-admin.css`, `${marketingAdminCss}\n${marketingLiveCss}\n`);
await writeFile(`${output}marketing-ai-admin.js`, `${marketingAdminJs}\n${marketingLiveJs}\n`);

// Device Control stays in the compact authenticated shell for now. Creator billing is
// deliberately separate so it can load only when Finance is opened.
const [compactCss, compactJs, deviceControlCss, deviceControlJs] = await Promise.all([
  readFile(`${output}compact-control-center.css`, 'utf8'),
  readFile(`${output}compact-control-center.js`, 'utf8'),
  readFile(`${root}device-control-admin.css`, 'utf8'),
  readFile(`${root}device-control-admin.js`, 'utf8'),
]);
await writeFile(`${output}compact-control-center.css`, `${compactCss}\n${deviceControlCss}\n`);
await writeFile(`${output}compact-control-center.js`, `${compactJs}\n${deviceControlJs}\n`);

// Chief AI chat is loaded only after AI Ops is explicitly opened. Strip its historical
// secondary-module autoload list and document-wide observer from the served asset.
const lazyJs = await readFile(`${output}admin-lazy-features.js`, 'utf8');
const lazyOnDemandJs = lazyJs
  .replace(/  const styles = \[[\s\S]*?\n  \];\n  const scripts = \[[\s\S]*?\n  \];/, '  const styles = [];\n  const scripts = [];')
  .replace(/  const observer = new MutationObserver\(\(\) => \{\n    if \(document\.querySelector\('#aiOpsPanel'\)\) installChiefChat\(\);\n  \}\);\n  observer\.observe\(document\.documentElement, \{ childList:true, subtree:true \}\);\n\n/, '');
await writeFile(`${output}admin-lazy-features.js`, lazyOnDemandJs);

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
    // Pre-auth stays tiny. After authentication only the shell and demand loader start;
    // operational workspaces are fetched when their menu item is opened.
    html = html.replace(/\s*<link rel="stylesheet" href="(?:compact-control-center|campus-actions)\.css">\s*/g, '\n');
    html = html.replace(/\s*<script src="(?:compact-control-center|control-center-features|campus-actions|admin-lazy-features)\.js"[^>]*><\/script>\s*/g, '\n');
    if (!html.includes('admin-authenticated-shell.js')) {
      html = html.replace('</body>', '<script src="admin-authenticated-shell.js?v=20260819-true-lazy-1" defer data-ekodi-postauth="compact-control-center.js control-center-features.js campus-actions.js admin-menu-layout.js admin-demand-loader.js"></script>\n</body>');
    }
  }
  await writeFile(path, html);
}

// GitHub-backed System Timeline stays with Deployments. System Health is a separate
// Services enhancement so opening Deployments is not required to see traffic trends.
const [releaseCss, releaseJs, timelineCss, timelineJs] = await Promise.all([
  readFile(`${output}release-control-admin.css`, 'utf8'),
  readFile(`${output}release-control-admin.js`, 'utf8'),
  readFile(`${root}system-timeline-admin.css`, 'utf8'),
  readFile(`${root}system-timeline-admin.js`, 'utf8'),
]);
await writeFile(`${output}release-control-admin.css`, `${releaseCss}\n${timelineCss}\n`);
await writeFile(`${output}release-control-admin.js`, `${releaseJs}\n${timelineJs}\n`);

console.log(`Built EKODI root with ${homepageServices.length} registry-driven homepage services, minimal pre-auth Control Center, true on-demand AI Ops/Deployments/Work/MarketingAI/Creator billing/System Health/Security, authenticated Campus/Device Control, GitHub-backed System Timeline, MarketingAI live ops, device bootstrap, auth hub, service hubs and trade assets: ${assets.join(', ')}`);