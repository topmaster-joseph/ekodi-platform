import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), '.github', 'workflows');
let failed = false;

for (const name of fs.readdirSync(dir).filter(name => /\.ya?ml$/.test(name)).sort()) {
  const file = path.join(dir, name);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/^\s*(git\s+push[^\n]*)$/gmi)) {
    const line = match[1].trim();
    const explicitHead = line.match(/HEAD:([^\s|]+)/i)?.[1] || '';
    const explicitBranch = line.match(/git\s+push\s+(?:origin\s+)?([^\s|]+)/i)?.[1] || '';
    const target = explicitHead || explicitBranch;
    const safeNonMain = target && !['main', 'master', 'origin', 'HEAD'].includes(target);
    if (!safeNonMain) {
      console.error(`❌ ${name}: direct or ambiguous repository push is forbidden: ${line}`);
      failed = true;
    }
  }
}
const publishing = fs.readFileSync(path.join(dir, 'deploy-publishing.yml'), 'utf8');
const sync = fs.readFileSync(path.join(dir, 'sync-control-center-services.yml'), 'utf8');
if (!/permissions:\s*[\s\S]*?contents:\s*read/.test(publishing) || /git\s+push/i.test(publishing)) {
  console.error('❌ Publishing workflow must preserve probe evidence without writing repository source.');
  failed = true;
}
if (!/permissions:\s*[\s\S]*?contents:\s*read/.test(sync) || /git\s+push/i.test(sync)) {
  console.error('❌ Control Center sync must be validation-only; source changes belong to guarded EKODI AI PRs.');
  failed = true;
}
if (failed) process.exit(1);
console.log('✅ Main write boundary audit passed: no workflow can ambiguously push repository source to main.');
