import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function patchAdminExternalHandoff(source) {
  const legacy = "requestedSection=section;window.setTimeout(()=>{if(!activatePanel(section))requestDemand(section);},0);";
  const handoff = "if(item.matches('a.nav[href]')&&!hasPanel(section))return;";
  // Accept exactly one of the original compact hook or the new stale-navigation
  // guarded hook. Preserve both independent safety invariants at build time.
  const guarded = /requestedSection=section;(?=\s*(?:\/\/[^\n]*\n\s*)*window\.setTimeout\(\(\)=>\{\s*if\(requestedSection!==section\)return;\s*if\(!activatePanel\(section\)\)requestDemand\(section\);\s*\},0\);)/g;
  const legacyCount = source.split(legacy).length - 1;
  const guardedCount = [...source.matchAll(guarded)].length;
  if (legacyCount + guardedCount !== 1)
    throw new Error(`Expected one Admin navigation handoff hook, found ${legacyCount + guardedCount}`);
  if (legacyCount) return source.replace(legacy, legacy.replace('window.setTimeout', handoff+'window.setTimeout'));
  return source.replace(guarded, 'requestedSection=section;'+handoff);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const target = fileURLToPath(new URL('../dist/admin-menu-layout.js', import.meta.url));
  const source = await readFile(target, 'utf8');
  const output = patchAdminExternalHandoff(source);
  await writeFile(target, output);
  console.log('Admin external handoff postbuild: native external navigation is single-shot; internal panel routing remains unchanged.');
}
