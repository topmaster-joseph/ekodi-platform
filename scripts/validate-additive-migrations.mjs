import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dirArg = args[0] || 'migrations';
const root = process.cwd();
const dir = path.resolve(root, dirArg);
if (!dir.startsWith(root + path.sep) || !fs.existsSync(dir)) {
  console.error(`Migration directory not found inside repository: ${dirArg}`);
  process.exit(2);
}

const forbidden = [
  { label: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  { label: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { label: 'ALTER TABLE ... RENAME', re: /\bALTER\s+TABLE\b[\s\S]{0,160}\bRENAME\b/i },
  { label: 'PRAGMA writable_schema', re: /\bPRAGMA\s+writable_schema\b/i },
  { label: 'direct sqlite schema mutation', re: /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|REPLACE\s+INTO)\s+(?:sqlite_master|sqlite_schema)\b/i },
];

const files = fs.readdirSync(dir)
  .filter(name => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (!files.length) {
  console.error(`No SQL migrations found in ${dirArg}`);
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const full = path.join(dir, file);
  const sql = fs.readFileSync(full, 'utf8')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of forbidden) {
    if (rule.re.test(sql)) {
      console.error(`❌ ${file}: destructive migration pattern blocked (${rule.label})`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('D1 migration gate failed. Use an expand/contract migration instead of a destructive in-place change.');
  process.exit(1);
}

console.log(`✅ ${files.length} D1 migrations passed the additive-schema guard.`);
