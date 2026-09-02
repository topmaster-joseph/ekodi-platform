import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const releaseRoot = path.join(root, '.release', 'ai-control');
const bundleRoot = path.join(root, '.release', 'ai-control-bundle');
const manifestPath = path.join(releaseRoot, 'artifact-manifest.json');
const verifyOnly = process.argv.includes('--verify');
const wranglerVersion = process.env.WRANGLER_VERSION || '4.127.1';

const normalize = value => String(value || '').replaceAll('\\', '/');
const sha256 = buffer => `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;

function walkFiles(directory, base = directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, base, output);
    else if (entry.isFile()) output.push(normalize(path.relative(base, absolute)));
  }
  return output.sort();
}

function fileDigest(relative) {
  return sha256(fs.readFileSync(path.join(releaseRoot, relative)));
}

function digestManifestEntries(files) {
  const canonical = files.map(file => `${file.sha256}  ${file.path}\n`).join('');
  return sha256(Buffer.from(canonical, 'utf8'));
}

function emitDigest(digest) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `artifact_digest=${digest}\n`);
}

function verifyArtifact() {
  if (!fs.existsSync(manifestPath)) throw new Error('AI Control artifact manifest is missing.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expected = Array.isArray(manifest.files) ? manifest.files : [];
  if (!expected.length) throw new Error('AI Control artifact manifest contains no files.');

  const actualPaths = walkFiles(releaseRoot).filter(relative => relative !== 'artifact-manifest.json');
  const expectedPaths = expected.map(file => String(file.path || '')).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error('AI Control artifact file set differs from the immutable manifest.');
  }

  for (const file of expected) {
    if (!file.path || !file.sha256) throw new Error('AI Control artifact manifest contains an invalid file record.');
    const actual = fileDigest(file.path);
    if (actual !== file.sha256) throw new Error(`AI Control artifact digest mismatch: ${file.path}`);
  }

  const aggregate = digestManifestEntries(expected);
  if (aggregate !== manifest.artifactDigest) throw new Error('AI Control aggregate artifact digest mismatch.');
  if (process.env.EXPECTED_AI_ARTIFACT_DIGEST && process.env.EXPECTED_AI_ARTIFACT_DIGEST !== aggregate) {
    throw new Error('AI Control artifact does not match the expected promotion digest.');
  }
  console.log(`✅ AI Control immutable artifact verified: ${aggregate}`);
  return aggregate;
}

function runWranglerBuild() {
  fs.rmSync(releaseRoot, { recursive: true, force: true });
  fs.rmSync(bundleRoot, { recursive: true, force: true });
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.mkdirSync(bundleRoot, { recursive: true });

  const wranglerArgs = [
    '--yes',
    `wrangler@${wranglerVersion}`,
    'deploy',
    '--dry-run',
    '--outdir',
    bundleRoot,
    '--config',
    'wrangler.ai.build.toml',
  ];
  const isWindows = process.platform === 'win32';
  const result = spawnSync(
    isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npx',
    isWindows ? ['/d', '/s', '/c', 'npx.cmd', ...wranglerArgs] : wranglerArgs,
    {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler AI Control dry-run build failed with exit code ${result.status}.`);

  const jsFiles = walkFiles(bundleRoot).filter(file => file.endsWith('.js') && !file.endsWith('.js.map'));
  if (jsFiles.length !== 1) throw new Error(`Expected exactly one bundled Worker JavaScript file, found ${jsFiles.length}.`);
  fs.copyFileSync(path.join(bundleRoot, jsFiles[0]), path.join(releaseRoot, 'worker.js'));

  const assetsSource = path.join(root, 'ai-control');
  if (!fs.existsSync(assetsSource)) throw new Error('AI Control static assets are missing.');
  fs.cpSync(assetsSource, path.join(releaseRoot, 'assets'), { recursive: true });
  fs.rmSync(bundleRoot, { recursive: true, force: true });

  const paths = walkFiles(releaseRoot).filter(relative => relative !== 'artifact-manifest.json');
  const files = paths.map(relative => ({ path: relative, sha256: fileDigest(relative) }));
  const artifactDigest = digestManifestEntries(files);
  const manifest = {
    schemaVersion: 1,
    artifact: 'ekodi-ai-control',
    sourceCommit: process.env.GITHUB_SHA || process.env.EKODI_SOURCE_COMMIT || '',
    wranglerVersion,
    compatibilityDate: '2026-09-01',
    artifactDigest,
    files,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  const verified = verifyArtifact();
  emitDigest(verified);
  console.log(`Built one AI Control application artifact from ${files.length} file(s).`);
}

if (verifyOnly) emitDigest(verifyArtifact());
else runWranglerBuild();
