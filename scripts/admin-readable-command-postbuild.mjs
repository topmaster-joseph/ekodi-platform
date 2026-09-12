import { appendFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const [baseCss, principlesCss, css, js] = await Promise.all([
  readFile(`${root}admin-readability-base.css`, 'utf8'),
  readFile(`${root}admin-ui-principles.css`, 'utf8'),
  readFile(`${root}admin-readable-command.css`, 'utf8'),
  readFile(`${root}admin-readable-command.js`, 'utf8'),
]);

new Function(js);

const baseCssMarkers = [
  'EKODI Admin readability base',
  'body.admin-compact{',
  '.content [data-panel] th',
  '#userAiMembershipPanel .uam-head h2',
  ':focus-visible',
];
const principlesCssMarkers = [
  'EKODI Admin subservice normalization v2',
  '--admin-page:#f6f8fb',
  '#marketingAiAdminPanel.marketing-ai-admin-panel',
  '.marketing-ai-console-view',
  'font-size:14px!important',
  '.marketing-ai-console-tabs button{min-height:42px!important;font-size:15px!important}',
  '@media(max-width:620px)',
];
const cssMarkers = [
  'governance-command-bar{display:none!important}',
  '#aiOpsPanel .ai-ops-side',
  '#aiOpsPanel .ai-chief-chat{order:1!important;position:static!important',
  '#aiOpsPanel .ai-chat-form{order:2!important',
  '#aiOpsPanel .ai-chat-messages{order:5!important',
  '#aiOpsPanel .ai-chat-text{font-size:15px!important',
];
const jsMarkers = [
  '/api/control/ai/actions',
  "actionType:'service.health_check'",
  "actionType:'ui.change_request'",
  '재구성',
  'specialistsFor',
  "headerTitle.textContent = '무엇을 할까요?'",
  "send.textContent = '실행'",
];
for (const marker of baseCssMarkers) {
  if (!baseCss.includes(marker)) throw new Error(`Admin readability base contract missing: ${marker}`);
}
for (const marker of principlesCssMarkers) {
  if (!principlesCss.includes(marker)) throw new Error(`Admin UI principles contract missing: ${marker}`);
}
for (const marker of cssMarkers) {
  if (!css.includes(marker)) throw new Error(`Admin flat CSS contract missing: ${marker}`);
}
for (const marker of jsMarkers) {
  if (!js.includes(marker)) throw new Error(`Admin orchestration JS contract missing: ${marker}`);
}

// Shared readability stays in the small authenticated first path.
// Marketing-specific visual normalization rides only with the already-lazy Marketing AI stylesheet,
// so improving readability does not tax every admin page at startup.
// The fixed command bootstrap is supplied by the shared Admin shell, while its lazy runtime must
// be published with the Shared Site assets so an accepted command can always reach the listener.
const assistAssets = [
  'admin-assist-bootstrap.js',
  'admin-assist-bootstrap.css',
  'admin-assist-dock.js',
  'admin-assist-dock.css',
  'admin-ai-control-plane.js',
];
await Promise.all([
  appendFile(`${output}admin-shell.css`, `\n/* admin-readability-base.css */\n${baseCss}\n`),
  appendFile(`${output}marketing-ai-admin.css`, `\n/* admin-ui-principles.css */\n${principlesCss}\n`),
  appendFile(`${output}ai-ops-admin.css`, `\n/* admin-readable-command.css */\n${css}\n`),
  appendFile(`${output}admin-lazy-features.js`, `\n/* admin-readable-command.js */\n${js}\n`),
  ...assistAssets.map(asset => copyFile(`${root}${asset}`, `${output}${asset}`)),
]);

console.log(`Applied Admin readability/orchestration and published lazy Assist runtime assets: ${assistAssets.join(', ')}`);
