#!/usr/bin/env node
// Read-only inventory of all tracked-style Wrangler TOML files, no provider credentials.
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { declaredBindings } from './data-store-topology.mjs';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));
const skipDirs = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', 'artifacts', '.release']);
const rows = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes:true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) await scan(join(dir, entry.name));
      continue;
    }
    if (!/^wrangler.*\.toml$/.test(entry.name) ||
        /\.(?:staging|development|example|build)(?:\.|$)/.test(entry.name)) continue;
    const path = join(dir, entry.name);
    const contents = await readFile(path, 'utf8');
    for (const row of declaredBindings(contents, 'd1_databases')) {
      rows.push({
        source: relative(root, path).replaceAll('\\','/'),
        binding: row.binding || '', engine: 'd1',
        resource: row.database_name || '',
        readiness: /REPLACE_WITH|TODO|CHANGEME|PLACEHOLDER/i.test(row.database_id || '')
          ? 'placeholder' : row.database_id ? 'declared' : 'missing-id'
      });
    }
  }
}
await scan(root);
rows.sort((a,b) => a.source.localeCompare(b.source) || a.binding.localeCompare(b.binding));
console.log(JSON.stringify({ source: 'source-manifests-only', liveVerified: false,
  declarations: rows.length, unresolved: rows.filter(r=>r.readiness !== 'declared').length,
  stores: rows }, null, 2));
