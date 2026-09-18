import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skipDirs = new Set(['.git','node_modules','.release','dist','coverage']);
const sourceExtensions = new Set(['.js','.mjs','.cjs']);
const providerEndpoint = /(?:api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com)/i;
const providerAdapterImport = /from\s+['"][^'"]*(?:openai|gemini|anthropic|claude|cloudflare-workers-ai)[^'"]*provider-adapter\.js['"]/i;
const allowedEndpointFiles = [
  /provider-adapter\.js$/i,
  /provider-router\.js$/i,
  /provider-control\.js$/i,
  /scripts[\\/]ai-account-node\.mjs$/i,
  /scripts[\\/]validate-author\.mjs$/i,
];
const allowedAdapterImporters = new Set([
  'ekodi-ai-provider-registry.js',
  'personal-ai-provider-registry.js',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (skipDirs.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) out.push(absolute);
  }
  return out;
}

const violations = [];
for (const absolute of walk(root)) {
  const relative = path.relative(root, absolute).replaceAll('\\','/');
  if (relative.startsWith('test/')) continue;
  const source = fs.readFileSync(absolute, 'utf8');
  if (providerEndpoint.test(source) && !allowedEndpointFiles.some(pattern => pattern.test(relative))) {
    violations.push(`${relative}: direct external provider endpoint`);
  }
  if (providerAdapterImport.test(source) && !allowedAdapterImporters.has(relative)) {
    violations.push(`${relative}: direct provider-adapter import outside registry`);
  }
}
if (violations.length) {
  console.error('EKODI provider boundary violations:');
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}
console.log('✅ EKODI provider boundary verified: services cannot bypass the central provider/orchestrator boundary.');
