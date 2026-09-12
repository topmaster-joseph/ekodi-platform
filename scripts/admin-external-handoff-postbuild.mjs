import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function patchAdminExternalHandoff(source) {
  const needle = "requestedSection=section;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);";
  const replacement = "requestedSection=section;if(item.matches('a.nav[href]')&&!hasPanel(section))return;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);";
  const matches = source.split(needle).length - 1;
  if (matches !== 1) throw new Error(`Expected one Admin navigation handoff hook, found ${matches}`);
  return source.replace(needle, replacement);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const target = fileURLToPath(new URL('../dist/admin-menu-layout.js', import.meta.url));
  const source = await readFile(target, 'utf8');
  const output = patchAdminExternalHandoff(source);
  await writeFile(target, output);
  console.log('Admin external handoff postbuild: native external navigation is single-shot; internal panel routing remains unchanged.');
}
