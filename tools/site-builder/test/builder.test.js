import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

test('site runtime is a typed React, Vite, and Tailwind application', async () => {
  const [template, application, styles] = await Promise.all([
    readFile(new URL('../../../packages/site-runtime/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/site-runtime/src/SiteApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/site-runtime/src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(template, /src="\/src\/main\.tsx"/);
  assert.match(template, /name="robots" content="\{\{ROBOTS_POLICY\}\}"/);
  assert.match(template, /rel="canonical"/);
  assert.match(application, /virtual:ekodi-site-config/);
  assert.match(application, /useEffect/);
  assert.match(application, /본문 바로가기/);
  assert.match(application, /dark:/);
  assert.match(styles, /@import "tailwindcss"/);
});

test('production builds emit public SEO and private crawl protection', async () => {
  const cli = resolve(root, 'tools/site-builder/cli.mjs');
  const publicApp = resolve(root, 'apps/marketing');
  const privateApp = resolve(root, 'apps/erp');
  await execute(process.execPath, ['--experimental-strip-types', cli, 'build'], { cwd: publicApp });
  await execute(process.execPath, ['--experimental-strip-types', cli, 'build'], { cwd: privateApp });

  const [publicHtml, publicRobots, publicSitemap, privateHtml, privateRobots, privateHeaders] = await Promise.all([
    readFile(resolve(publicApp, 'dist/index.html'), 'utf8'),
    readFile(resolve(publicApp, 'dist/robots.txt'), 'utf8'),
    readFile(resolve(publicApp, 'dist/sitemap.xml'), 'utf8'),
    readFile(resolve(privateApp, 'dist/index.html'), 'utf8'),
    readFile(resolve(privateApp, 'dist/robots.txt'), 'utf8'),
    readFile(resolve(privateApp, 'dist/_headers'), 'utf8')
  ]);
  assert.match(publicHtml, /name="robots" content="index, follow"/);
  assert.match(publicRobots, /Allow: \//);
  assert.match(publicSitemap, /https:\/\/marketing\.ekodi\.kr\//);
  assert.match(privateHtml, /noindex, nofollow, noarchive/);
  assert.match(privateRobots, /Disallow: \//);
  assert.match(privateHeaders, /X-Robots-Tag: noindex, nofollow, noarchive/i);
});
