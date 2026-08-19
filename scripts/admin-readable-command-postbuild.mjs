import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
const [css, js] = await Promise.all([
  readFile(`${root}admin-readable-command.css`, 'utf8'),
  readFile(`${root}admin-readable-command.js`, 'utf8'),
]);

// Parse the browser patch before it can enter a deploy artifact.
new Function(js);

const cssMarkers = [
  'governance-command-bar{display:none!important}',
  '.ai-chat-form{order:2',
  '.ai-chat-messages{order:4',
  '.ai-chat-text{font-size:15px',
];
const jsMarkers = [
  '/api/control/ai/actions',
  "actionType:'service.health_check'",
  "headerTitle.textContent = '무엇을 할까요?'",
  "send.textContent = '실행'",
];
for (const marker of cssMarkers) {
  if (!css.includes(marker)) throw new Error(`Admin readable CSS contract missing: ${marker}`);
}
for (const marker of jsMarkers) {
  if (!js.includes(marker)) throw new Error(`Admin readable JS contract missing: ${marker}`);
}

// The readable command layer belongs to AI Ops. Keep its CSS out of the always-loaded
// compact shell and ship it with the AI Ops stylesheet that is fetched only on activation.
await Promise.all([
  appendFile(`${output}ai-ops-admin.css`, `\n/* admin-readable-command.css */\n${css}\n`),
  appendFile(`${output}admin-lazy-features.js`, `\n/* admin-readable-command.js */\n${js}\n`),
]);

console.log('Applied EKODI readable, light, command-first layer only inside on-demand AI Ops assets.');
