import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/core-data-boundaries.json'), 'utf8'));
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const violations = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      walk(full);
      continue;
    }
    if (!extensions.has(path.extname(entry.name))) continue;
    const relative = path.relative(root, full).replaceAll('\\', '/');
    const source = fs.readFileSync(full, 'utf8');
    const tables = config.protectedTables.filter(table => source.includes(table));
    if (tables.length) violations.push({ file: relative, tables });
  }
}

for (const platformRoot of config.platformRoots) walk(path.join(root, platformRoot));

if (violations.length) {
  console.error('EKODI Core data-boundary violations detected:');
  for (const item of violations) console.error(`- ${item.file}: ${item.tables.join(', ')}`);
  console.error(`\n${config.rule}`);
  process.exit(1);
}

console.log(`EKODI Core data boundaries OK across ${config.platformRoots.length} platform roots.`);
