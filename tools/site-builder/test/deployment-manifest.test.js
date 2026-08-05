import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { EKODI_SERVICES } from '@ekodi/ecosystem-catalog';

const root = resolve(import.meta.dirname, '../../..');

test('Cloudflare manifest covers the API and every application workspace', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'infra/cloudflare/projects.json'), 'utf8'));
  assert.equal(manifest.projects.length, EKODI_SERVICES.length + 1);
  assert.equal(new Set(manifest.projects.map(project => project.worker)).size, manifest.projects.length);
  assert.deepEqual(
    manifest.projects.filter(project => project.domain).map(project => project.domain).sort(),
    EKODI_SERVICES.map(service => service.targetDomain).sort()
  );

  for (const project of manifest.projects) {
    const wrangler = await readFile(resolve(root, project.config), 'utf8');
    assert.match(wrangler, new RegExp(`name\\s*=\\s*"${project.worker}"`));
  }
});

test('private applications are excluded from search indexing', async () => {
  const builder = await readFile(resolve(root, 'tools/site-builder/cli.mjs'), 'utf8');
  assert.match(builder, /noindex, nofollow, noarchive/);
  assert.match(builder, /Disallow: \//);
  assert.match(builder, /if \(isPrivate\)/);
});
