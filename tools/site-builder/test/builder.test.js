import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
