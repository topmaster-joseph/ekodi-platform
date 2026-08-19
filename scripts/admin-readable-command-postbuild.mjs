import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const [css, js] = await Promise.all([
  readFile(`${root}admin-readable-command.css`, 'utf8'),
  readFile(`${root}admin-readable-command.js`, 'utf8'),
]);

new Function(js);

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
for (const marker of cssMarkers) {
  if (!css.includes(marker)) throw new Error(`Admin flat CSS contract missing: ${marker}`);
}
for (const marker of jsMarkers) {
  if (!js.includes(marker)) throw new Error(`Admin orchestration JS contract missing: ${marker}`);
}

await Promise.all([
  appendFile(`${output}compact-control-center.css`, `\n/* admin-readable-command.css */\n${css}\n`),
  appendFile(`${output}admin-lazy-features.js`, `\n/* admin-readable-command.js */\n${js}\n`),
]);

console.log('Applied EKODI flat readable Admin and Chief AI orchestration layer in existing lazy bundles.');
