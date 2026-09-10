import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clean = value => String(value ?? '').trim().replaceAll('\\', '/');
const readLines = file => fs.readFileSync(file, 'utf8').split(/\r?\n/).map(clean).filter(Boolean);

export function loadReviewScopes(file) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.policyId !== 'PARALLEL-RELATED-REVIEW-001' || !Array.isArray(config.scopes)) {
    throw new Error('Invalid parallel related-change review scope policy.');
  }
  return config;
}

export function scopesForFiles(files, config) {
  const normalized = [...new Set(files.map(clean).filter(Boolean))];
  const matches = new Map();
  for (const scope of config.scopes) {
    const patterns = (scope.patterns || []).map(pattern => new RegExp(pattern, 'i'));
    const matchingFiles = normalized.filter(file => patterns.some(pattern => pattern.test(file)));
    if (matchingFiles.length) matches.set(scope.id, matchingFiles);
  }
  return matches;
}

export function semanticScopeOverlaps(leftFiles, rightFiles, config) {
  const left = scopesForFiles(leftFiles, config);
  const right = scopesForFiles(rightFiles, config);
  return [...left.keys()].filter(id => right.has(id)).map(id => ({
    scope: id,
    leftFiles: left.get(id),
    rightFiles: right.get(id),
  }));
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const configFile = argValue('--config');
  const leftFile = argValue('--left-file');
  const rightFile = argValue('--right-file');
  if (!configFile || !leftFile || !rightFile) {
    console.error('Usage: node scripts/detect-related-change-overlap.mjs --config <json> --left-file <paths> --right-file <paths>');
    process.exit(2);
  }
  const config = loadReviewScopes(configFile);
  for (const overlap of semanticScopeOverlaps(readLines(leftFile), readLines(rightFile), config)) {
    const left = overlap.leftFiles.join(',');
    const right = overlap.rightFiles.join(',');
    process.stdout.write(`${overlap.scope}\t${left}\t${right}\n`);
  }
}
