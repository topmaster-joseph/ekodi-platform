import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const functionsRoot = path.join(root, 'supabase', 'functions');

async function tsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  }));
  return nested.flat();
}

test('legacy dotted capability generator stays confined to the compatibility Trust API', async () => {
  const uses = [];
  for (const file of await tsFiles(functionsRoot)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative === 'supabase/functions/_shared/trust.ts' || relative === 'supabase/functions/_shared/trust.test.ts') continue;
    if ((await readFile(file, 'utf8')).includes('capabilitySet(')) uses.push(relative);
  }
  assert.deepEqual(uses.sort(), ['supabase/functions/trust-api/index.ts']);
});

test('runtime Trust code does not hardcode the retired dotted capability grammar', async () => {
  const dotted = /["'`][a-z0-9_-]+\.[a-z0-9_.-]+\.(?:read|write|manage|review|operate|delete|create|update|export|download|share|execute|diagnose_safe)["'`]/i;
  const offenders = [];
  for (const file of await tsFiles(functionsRoot)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative === 'supabase/functions/_shared/trust.ts' || relative.endsWith('.test.ts')) continue;
    if (dotted.test(await readFile(file, 'utf8'))) offenders.push(relative);
  }
  assert.deepEqual(offenders, []);
});
