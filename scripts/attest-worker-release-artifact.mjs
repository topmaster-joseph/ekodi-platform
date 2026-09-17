import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const options = { files: [] };
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const next = args[index + 1];
  if (arg === '--bundle') { options.bundle = next; index += 1; }
  else if (arg === '--assets') { options.assets = next; index += 1; }
  else if (arg === '--file') { options.files.push(next); index += 1; }
  else if (arg === '--output') { options.output = next; index += 1; }
  else if (arg === '--source-sha') { options.sourceSha = next; index += 1; }
  else if (arg === '--wrangler-version') { options.wranglerVersion = next; index += 1; }
  else {
    console.error(`Unknown or incomplete argument: ${arg}`);
    process.exit(2);
  }
}

if (!options.bundle || !options.output) {
  console.error('Usage: node scripts/attest-worker-release-artifact.mjs --bundle <dir> [--assets <dir>] [--file label=path]... --output <file> [--source-sha <sha>] [--wrangler-version <version>]');
  process.exit(2);
}

const root = process.cwd();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => value.split(path.sep).join('/');
const WRANGLER_GENERATED_METADATA = new Set(['README.md']);

function assertInsideWorkspace(targetPath, label) {
  const resolved = path.resolve(root, targetPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the workspace: ${targetPath}`);
  }
  return resolved;
}

function collectDirectory(directory, prefix, { excludeRootFiles = new Set() } = {}) {
  const resolved = assertInsideWorkspace(directory, prefix);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${prefix} directory missing: ${directory}`);
  }
  const entries = [];
  const walk = (current, relativeBase = '') => {
    const names = fs.readdirSync(current).sort((a, b) => a.localeCompare(b, 'en'));
    for (const name of names) {
      if (!relativeBase && excludeRootFiles.has(name)) continue;
      const absolute = path.join(current, name);
      const relative = path.join(relativeBase, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed in release artifacts: ${absolute}`);
      if (stat.isDirectory()) walk(absolute, relative);
      else if (stat.isFile()) {
        const content = fs.readFileSync(absolute);
        entries.push({
          path: `${prefix}/${normalize(relative)}`,
          bytes: content.length,
          sha256: sha256(content),
        });
      }
    }
  };
  walk(resolved);
  return entries;
}

function collectFile(spec) {
  const separator = spec.indexOf('=');
  if (separator < 1 || separator === spec.length - 1) throw new Error(`--file must be label=path: ${spec}`);
  const label = spec.slice(0, separator).trim();
  const filename = spec.slice(separator + 1).trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error(`invalid release artifact label: ${label}`);
  const resolved = assertInsideWorkspace(filename, label);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`release artifact file missing: ${filename}`);
  const content = fs.readFileSync(resolved);
  return { path: `metadata/${label}/${path.basename(filename)}`, bytes: content.length, sha256: sha256(content) };
}

try {
  const entries = [
    ...collectDirectory(options.bundle, 'bundle', { excludeRootFiles: WRANGLER_GENERATED_METADATA }),
    ...(options.assets ? collectDirectory(options.assets, 'assets') : []),
    ...options.files.map(collectFile),
  ].sort((a, b) => a.path.localeCompare(b.path, 'en'));

  if (entries.length === 0) throw new Error('release artifact contains no files');
  const canonical = `${JSON.stringify({ schemaVersion: 1, entries })}\n`;
  const artifactDigest = `sha256:${sha256(canonical)}`;
  const evidence = {
    schemaVersion: 1,
    evidenceId: 'GEN10-IMMUTABLE-RELEASE-ARTIFACT-001',
    generatedAt: new Date().toISOString(),
    sourceSha: options.sourceSha || process.env.GITHUB_SHA || null,
    wranglerVersion: options.wranglerVersion || null,
    artifactDigest,
    entryCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
    claimBoundary: {
      digestCoversWranglerDryRunBundle: true,
      digestCoversStaticAssets: Boolean(options.assets),
      digestCoversDeclaredMetadataFiles: options.files.length > 0,
      digestExcludesWranglerGeneratedOutdirReadme: true,
      wranglerGeneratedOutdirReadmeReason: 'Wrangler writes README.md with new Date().toISOString(); it is tool metadata and not part of the deployed Worker payload.',
      digestDoesNotIncludeSecrets: true,
      providerUploadPerformedByThisScript: false,
    },
  };

  const output = assertInsideWorkspace(options.output, 'output');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[EKODI][RELEASE-ARTIFACT-001] ${artifactDigest}`);
  console.log(`[EKODI][RELEASE-ARTIFACT-001] entries=${entries.length} bytes=${evidence.totalBytes}`);
} catch (error) {
  console.error(`[EKODI][RELEASE-ARTIFACT-001] ${error.message}`);
  process.exit(1);
}
