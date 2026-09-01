import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../dist/admin-demand-loader.js', import.meta.url);
const source = await readFile(path, 'utf8');
const compact = source.replace(/^ {2}/gm, '');
new Function(compact);
await writeFile(path, compact);
console.log(`Compacted Admin demand loader: ${Buffer.byteLength(source)}B -> ${Buffer.byteLength(compact)}B`);
