import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path=fileURLToPath(new URL('../dist/admin-demand-loader.js',import.meta.url));
let source=await readFile(path,'utf8');
for(const [from,to] of [
  ['loadedScripts','LS'],
  ['loadedStyles','LC'],
  ['secondaryScheduled','SS'],
  ['activateFeature','actF'],
  ['insertPlaceholder','insP'],
  ['scheduleSecondary','sched2'],
  ['bindBaseEnhancements','bindBase'],
  ['requestedFeature','reqF'],
  ['ASSET_VERSION','AV'],
  ['TOKEN_KEY','TK'],
]) source=source.replaceAll(from,to);
source=source.split('\n').map(line=>line.trimStart()).filter(Boolean).join('\n')+'\n';
await writeFile(path,source);
