import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../dist/admin-demand-loader.js', import.meta.url);
const source = await readFile(path, 'utf8');
let compact = source
  .replace(/^\s*'cheonggye-members':\s*\{[^\n]+\},\s*$/m, '')
  .replaceAll('label:', 'l:')
  .replaceAll('icon:', 'i:')
  .replaceAll('real:', 'r:')
  .replaceAll('insert:', 'n:')
  .replaceAll('feature.label', 'feature.l')
  .replaceAll('feature.icon', 'feature.i')
  .replaceAll('feature.real', 'feature.r')
  .replaceAll('feature.insert', 'feature.n')
  .replace(/^ {2}/gm, '');
new Function(compact);
await writeFile(path, compact);
console.log(`Compacted Admin demand loader: ${Buffer.byteLength(source)}B -> ${Buffer.byteLength(compact)}B`);
