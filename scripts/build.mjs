import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadHomepageServices, renderServiceCards } from './ecosystem-registry.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = [
  'index.html','privacy.html','terms.html','history.html','mall.html','mall.css','mall.js','homepage-ambient.css','homepage-ambient.js','admin-shell.html','admin-shell.css','admin-finance.css','admin-central-handoff.js','admin-authenticated-shell.js','admin-demand-loader.js','admin-menu-layout.js','admin-menu-registry.js','admin-sidebar.js','admin-menu-runtime.js','device-control-admin.css','device-control-admin.js','storage-admin.css','storage-admin.js','homepage-admin.js','admin-secret-generator.css','admin-secret-generator.js','finance-monitor.js','client-access.css','client-access.js','marketing-funnel-admin.css','marketing-funnel-admin.js','marketing-ai-admin.css','marketing-ai-admin.js','google-admin-auth.css','google-admin-auth.js','ekodi-message-ui.js','domains-hub.css','domains-hub.js','social-admin.css','social-admin.js','release-control-admin.css','release-control-admin.js','community-reports-admin.css','community-reports-admin.js','books-admin.css','books-admin.js','books-finance-admin.css','books-finance-admin.js','admin-compact.css','admin-readable-command.css','admin-readable-command.js','campus-actions.css','campus-actions.js','ai-ops-admin.css','ai-ops-admin.js','ai-module-spec-admin.css','ai-module-spec-admin.js','life-ai-admin.css','life-ai-admin.js','mission-control-admin.css','mission-control-admin.js','work-admin.css','work-admin.js','admin-lazy-features.js','author-billing-admin.css','author-billing-admin.js','system-health-admin.css','system-health-admin.js','api-cost-admin.css','api-cost-admin.js','device-browser-diagnostics.css','device-browser-diagnostics.js','ekodi-device-bootstrap.cmd','hub.html','trade.html','styles.css','script.js','monitor-status.json','_headers',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(asset => cp(`${root}${asset}`, `${output}${asset}`)));

const [browserDiagnosticsBaseJs, deviceWakeAdminJs] = await Promise.all([
  readFile(`${output}device-browser-diagnostics.js`, 'utf8'),
  readFile(`${root}device-wake-admin.js`, 'utf8'),
]);
if (!browserDiagnosticsBaseJs.includes('서버로 업로드하지 않습니다')) throw new Error('Browser diagnostics local-only marker missing');
if (!deviceWakeAdminJs.includes('원격 전원 · 작업 자동복귀')) throw new Error('Device Wake admin marker missing');
await writeFile(`${output}device-browser-diagnostics.js`, `${browserDiagnosticsBaseJs}\n${deviceWakeAdminJs}\n`);

const [aiOpsBaseJs, userAiTierPanelJs] = await Promise.all([
  readFile(`${output}ai-ops-admin.js`, 'utf8'),
  readFile(`${root}user-ai-tier-panel.js`, 'utf8'),
]);
if (!userAiTierPanelJs.includes('Core 우선 · AI 필요 시 자동 선택')) throw new Error('Core-first User AI membership policy marker missing');
if (userAiTierPanelJs.includes('개인 API → EKODI → 개인 Web → Core')) throw new Error('Legacy User AI fallback chain returned');
await writeFile(`${output}ai-ops-admin.js`, `${aiOpsBaseJs}\n${userAiTierPanelJs}\n`);

const [adminAiControlPlaneJs, adminAiGovernorJs, adminProviderControlJs] = await Promise.all([
  readFile(`${root}admin-ai-control-plane.js`, 'utf8'),
  readFile(`${root}admin-ai-governor.js`, 'utf8'),
  readFile(`${root}admin-provider-control.js`, 'utf8'),
]);
const [aiOpsWithTierJs, secretGeneratorBaseJs] = await Promise.all([
  readFile(`${output}ai-ops-admin.js`, 'utf8'),
  readFile(`${output}admin-secret-generator.js`, 'utf8'),
]);
if (!adminAiControlPlaneJs.includes('EKODIAdminAIControlPlane')) throw new Error('Admin AI control plane marker missing');
if (!adminAiGovernorJs.includes('EKODIAdminAIGovernor')) throw new Error('Admin AI governor marker missing');
if (!adminProviderControlJs.includes('EKODIProviderControl')) throw new Error('Unified provider control marker missing');
await Promise.all([
  writeFile(`${output}ai-ops-admin.js`, `${aiOpsWithTierJs}\n${adminAiGovernorJs}\n${adminProviderControlJs}\n${adminAiControlPlaneJs}\n`),
  writeFile(`${output}admin-secret-generator.js`, `${secretGeneratorBaseJs}\n${adminAiGovernorJs}\n${adminProviderControlJs}\n${adminAiControlPlaneJs}\n`),
]);

const [financeBaseCss, financeBaseJs, taxInvoiceCss, taxInvoiceJs] = await Promise.all([
  readFile(`${output}admin-finance.css`, 'utf8'), readFile(`${output}finance-monitor.js`, 'utf8'),
  readFile(`${root}tax-invoice-admin.css`, 'utf8'), readFile(`${root}tax-invoice-admin.js`, 'utf8'),
]);
await writeFile(`${output}admin-finance.css`, `${financeBaseCss}\n${taxInvoiceCss}\n`);
await writeFile(`${output}finance-monitor.js`, `${financeBaseJs}\n${taxInvoiceJs}\n`);

const [marketingAdminCss, marketingAdminJs, marketingLiveCss, marketingLiveJs, marketingPostingStatusJs, marketingChannelManagerJs] = await Promise.all([
  readFile(`${output}marketing-ai-admin.css`, 'utf8'), readFile(`${output}marketing-ai-admin.js`, 'utf8'),
  readFile(`${root}marketing-ai-admin-live-ops.css`, 'utf8'), readFile(`${root}marketing-ai-admin-live-ops.js`, 'utf8'),
  readFile(`${root}marketing-ai-admin-posting-status.js`, 'utf8'),
  readFile(`${root}marketing-ai-channel-manager.js`, 'utf8'),
]);
if (!marketingPostingStatusJs.includes("TAB_KEY = 'publications'")) throw new Error('Marketing posting status marker missing');
if (!marketingChannelManagerJs.includes("TAB_KEY = 'channels'")) throw new Error('Marketing channel manager marker missing');
if (!marketingAdminJs.includes("['channels','Channels']")) throw new Error('Marketing channels tab source marker missing');
const marketingAdminLocalizedJs = marketingAdminJs.replace("['channels','Channels']", "['channels','게시 · 홍보']");
if (!marketingAdminLocalizedJs.includes("['channels','게시 · 홍보']")) throw new Error('Marketing 게시 · 홍보 tab label build marker missing');
await writeFile(`${output}marketing-ai-admin.css`, `${marketingAdminCss}\n${marketingLiveCss}\n`);
await writeFile(`${output}marketing-ai-admin.js`, `${marketingAdminLocalizedJs}\n${marketingLiveJs}\n${marketingPostingStatusJs}\n${marketingChannelManagerJs}\n`);

const lazyJs = await readFile(`${output}admin-lazy-features.js`, 'utf8');
const lazyOnDemandJs = lazyJs
  .replace(/  const styles = \[[\s\S]*?\n  \];\n  const scripts = \[[\s\S]*?\n  \];/, '  const styles = [];\n  const scripts = [];')
  .replace(/  const observer = new MutationObserver\(\(\) => \{\n    if \(document\.querySelector\('#aiOpsPanel'\)\) installChiefChat\(\);\n  \}\);\n  observer\.observe\(document\.documentElement, \{ childList:true, subtree:true \}\);\n\n/, '');
await writeFile(`${output}admin-lazy-features.js`, lazyOnDemandJs);

const [financeCss, distributionCss, pipelineCss, royaltyCss, financeJs, distributionJs, pipelineJs, pipelineBridgeJs, royaltyJs] = await Promise.all([
  readFile(`${output}books-finance-admin.css`, 'utf8'), readFile(`${root}books-distribution-admin.css`, 'utf8'), readFile(`${root}books-pipeline-admin.css`, 'utf8'), readFile(`${root}books-royalty-admin.css`, 'utf8'),
  readFile(`${output}books-finance-admin.js`, 'utf8'), readFile(`${root}books-distribution-admin.js`, 'utf8'), readFile(`${root}books-pipeline-admin.js`, 'utf8'), readFile(`${root}books-pipeline-bridge.js`, 'utf8'), readFile(`${root}books-royalty-admin.js`, 'utf8'),
]);
await writeFile(`${output}books-finance-admin.css`, `${financeCss}\n${distributionCss}\n${pipelineCss}\n${royaltyCss}\n`);
await writeFile(`${output}books-finance-admin.js`, `${financeJs}\n${distributionJs}\n${pipelineJs}\n${pipelineBridgeJs}\n${royaltyJs}\n`);

await cp(`${root}auth-site/index.html`, `${output}auth-center.html`);
for (const asset of ['auth.css', 'auth.js', 'auth-router.js', 'marketing-auth-hotfix.js', 'auth-workspace-target.js', 'admin-auth.js', 'client-auth.js', 'author-auth.js', 'business-auth.js', 'marketing-onboarding.js', 'membership-ui.js']) await cp(`${root}auth-site/${asset}`, `${output}${asset}`);

const homepageServices = await loadHomepageServices();
const homepageCards = renderServiceCards(homepageServices);
const responsiveCss = await readFile(`${root}responsive.css`, 'utf8');
const htmlAssets = [...assets.filter(asset => asset.endsWith('.html')), 'auth-center.html'];
for (const asset of htmlAssets) {
  const path = `${output}${asset}`;
  let html = await readFile(path, 'utf8');
  if (asset === 'index.html') {
    const serviceGrid = /<div class="service-grid">[\s\S]*?(\r?\n\s*<\/div>\r?\n\s*<\/div>\r?\n\s*<\/section>)/;
    if (!serviceGrid.test(html)) throw new Error('EKODI homepage service grid marker not found');
    html = html.replace(serviceGrid, `<div class="service-grid" data-ekodi-service-registry="v1">\n${homepageCards}$1`);
    html = html.replaceAll('EKODI선교회', '커뮤니티').replaceAll('에코디선교회', '커뮤니티').replaceAll('https://youtube.com/@ekodicommunity', 'https://community.ekodi.kr').replaceAll('https://www.youtube.com/@ekodicommunity', 'https://community.ekodi.kr');
    if (html.includes('EKODI선교회') || html.includes('에코디선교회')) throw new Error('Legacy EKODI mission brand remains on homepage');
    if (!html.includes('homepage-ambient.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/homepage-ambient.css">\n</head>');
    if (!html.includes('homepage-ambient.js')) html = html.replace('</body>', '<script src="/homepage-ambient.js" defer></script>\n</body>');
  }
  if (!html.includes('data-ekodi-responsive')) html = html.replace('</head>', `<style data-ekodi-responsive>\n${responsiveCss}\n</style>\n</head>`);
  if (asset === 'admin-shell.html') {
    html = html.replace(/\s*<script src="finance-monitor\.js"><\/script>\s*/g, '\n');
    html = html.replace(/\s*<link rel="stylesheet" href="(?:admin-compact|campus-actions)\.css">\s*/g, '\n');
    html = html.replace(/\s*<script src="(?:admin-compact|control-center-features|campus-actions|admin-lazy-features)\.js"[^>]*><\/script>\s*/g, '\n');
    if (!html.includes('admin-authenticated-shell.js')) html = html.replace('</body>', '<script src="admin-authenticated-shell.js?v=20260819-true-lazy-1" defer data-ekodi-postauth="admin-menu-layout.js admin-demand-loader.js"></script>\n</body>');
  }
  await writeFile(path, html);
}

const [releaseCss, releaseJs, timelineCss, timelineJs] = await Promise.all([
  readFile(`${output}release-control-admin.css`, 'utf8'), readFile(`${output}release-control-admin.js`, 'utf8'),
  readFile(`${root}system-timeline-admin.css`, 'utf8'), readFile(`${root}system-timeline-admin.js`, 'utf8'),
]);
await writeFile(`${output}release-control-admin.css`, `${releaseCss}\n${timelineCss}\n`);
await writeFile(`${output}release-control-admin.js`, `${releaseJs}\n${timelineJs}\n`);

console.log(`Built EKODI root with ${homepageServices.length} registry-driven homepage services, minimal pre-auth Admin Shell, true on-demand AI Ops/External AI Spec/Deployments/Work/MarketingAI/Creator billing/System Health/Security, Admin AI Governor, unified Provider Control, authenticated Campus/Device Control, GitHub-backed System Timeline, MarketingAI live ops, posting status and channel connection console, device bootstrap, auth hub, service hubs and trade assets: ${assets.join(', ')}`);
