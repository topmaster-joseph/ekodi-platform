import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { EKODI_SERVICES } from '@ekodi/ecosystem-catalog';

const root = resolve(import.meta.dirname, '../../..');

test('Cloudflare manifest covers the API and every application workspace', async () => {
  const manifest = JSON.parse(await readFile(resolve(root, 'infra/cloudflare/projects.json'), 'utf8'));
  assert.equal(manifest.productionBranch, 'main');
  assert.equal(manifest.rootDirectory, '.');
  assert.match(manifest.deploy, /^pnpm exec wrangler deploy/);
  assert.match(manifest.previewDeploy, /^pnpm exec wrangler versions upload/);
  assert.equal(manifest.projects.length, EKODI_SERVICES.length + 1);
  assert.equal(new Set(manifest.projects.map(project => project.worker)).size, manifest.projects.length);
  assert.deepEqual(
    manifest.projects.filter(project => project.domain).map(project => project.domain).sort(),
    EKODI_SERVICES.map(service => service.targetDomain).sort()
  );

  for (const project of manifest.projects) {
    const wrangler = await readFile(resolve(root, project.config), 'utf8');
    assert.match(wrangler, new RegExp(`name\\s*=\\s*"${project.worker}"`));
    assert.match(wrangler, /preview_urls\s*=\s*true/);
    if (project.workspace !== '@ekodi/operations-api') {
      assert.match(wrangler, /\[assets\]/);
      assert.match(wrangler, /directory\s*=\s*"\.\/dist"/);
    }
  }

  const api = manifest.projects.find(project => project.workspace === '@ekodi/operations-api');
  const apiWrangler = await readFile(resolve(root, api.config), 'utf8');
  assert.match(apiWrangler, /main\s*=\s*"src\/worker\.ts"/);
  assert.match(apiWrangler, /\[\[d1_databases\]\]/);
  assert.match(apiWrangler, /\[\[r2_buckets\]\]/);

  for (const service of EKODI_SERVICES.filter(item => item.id !== 'platform')) {
    const project = manifest.projects.find(item => item.domain === service.targetDomain);
    const build = project.build || manifest.siteDefaults.build.replace('{{workspace}}', project.workspace);
    const watch = project.watch || manifest.siteDefaults.watch.map(path => path.replace('{{appPath}}', service.appPath));
    assert.match(build, new RegExp(project.workspace.replace('/', '\\/')));
    assert.ok(watch.includes(`${service.appPath}/**`));
    assert.ok(watch.includes('packages/site-runtime/**'));
  }
});

test('private applications are excluded from search indexing', async () => {
  const builder = await readFile(resolve(root, 'tools/site-builder/cli.mjs'), 'utf8');
  assert.match(builder, /noindex, nofollow, noarchive/);
  assert.match(builder, /Disallow: \//);
  assert.match(builder, /if \(isPrivate\)/);
});
