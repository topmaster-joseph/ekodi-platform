import { appendFile, readFile } from 'node:fs/promises';
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
  'body.compact-control-center{',
  '.content [data-panel] th',
  '#userAiMembershipPanel .uam-head h2',
  ':focus-visible',
];
const principlesCssMarkers = [
  'EKODI Admin UI Principles v1',
  '--admin-page:#f6f8fb',
  '#marketingAiAdminPanel.marketing-ai-admin-panel',
  '.marketing-ai-console-view',
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
await Promise.all([
  appendFile(`${output}control-center.css`, `\n/* admin-readability-base.css */\n${baseCss}\n`),
  appendFile(`${output}marketing-ai-admin.css`, `\n/* admin-ui-principles.css */\n${principlesCss}\n`),
  appendFile(`${output}ai-ops-admin.css`, `\n/* admin-readable-command.css */\n${css}\n`),
  appendFile(`${output}admin-lazy-features.js`, `\n/* admin-readable-command.js */\n${js}\n`),
]);

console.log('Applied the shared Admin readability base on first path, the readable lightweight Marketing AI skin on demand, and kept AI Ops orchestration lazy.');
