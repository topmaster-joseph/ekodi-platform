import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [html, shell, handoff, demand, google, css, postbuild] = await Promise.all([
  read('../admin-shell.html'),
  read('../admin-authenticated-shell.js'),
  read('../admin-central-handoff.js'),
  read('../admin-demand-loader.js'),
  read('../google-admin-auth.js'),
  read('../admin-shell.css'),
  read('../scripts/admin-performance-postbuild.mjs'),
]);

test('nested Admin routes anchor first-path assets at /admin/', () => {
  for (const asset of ['admin-shell.css','admin-canonical-routes.js','admin-surface-labels.js','admin-central-handoff.js','admin-authenticated-shell.js']) {
    assert.ok(html.includes(`/admin/${asset}`), `${asset} must be root-anchored`);
  }
  assert.match(shell, /`\/admin\/\$\{path\}`/);
  assert.match(demand, /`\/admin\/\$\{path\}`/);
  assert.match(postbuild, /href="\/admin\/admin-shell\.css\?v=/);
});

test('invalidated optimistic sessions cannot finish authenticated boot', () => {
  assert.match(shell, /function abortBootIfLoggedOut\(\)/);
  assert.match(shell, /await loadScript\(src\);if\(abortBootIfLoggedOut\(\)\)return/);
  assert.match(shell, /const run=\(\)=>authenticated\(\)\?Promise\.allSettled/);
});
test('returning to login removes authenticated UI residue', () => {
  assert.match(handoff, /function resetPreAuthSurface\(\)/);
  for (const residue of ['admin-compact','ekodi-admin-shell-v2','admin-command-active','google-auth-enabled','ekodiAssistBootstrap','ekodiAssistDock','googleAdminLogin']) {
    assert.ok(handoff.includes(residue), `cleanup must cover ${residue}`);
  }
  assert.match(handoff, /function showLogin\(message=''\).*resetPreAuthSurface\(\)/);
});

test('canonical Admin login owns the pre-auth surface', () => {
  assert.match(google, /document\.querySelector\('#centralAdminLogin'\)/);
  assert.match(css, /\.login-screen\{[^}]*background:radial-gradient/);
  assert.match(css, /\.login-screen \.brand strong,\.login-screen h1\{color:#f3f7fd\}/);
});
