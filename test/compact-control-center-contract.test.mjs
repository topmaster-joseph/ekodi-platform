import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [ui, css, build] = await Promise.all([
  read('../admin-compact.js'),
  read('../admin-compact.css'),
  read('../scripts/build.mjs'),
]);

test('compact admin navigation is English and includes Campus, Operations and Policies', () => {
  for (const label of [
    'Campus', 'Operations', 'Services', 'Clients', 'Admin Accounts', 'Finance', 'Mail & Live',
    'Cloud & Files', 'Organization', 'Domains & DNS', 'Policies', 'Activity Logs',
  ]) assert.ok(ui.includes(label), `missing navigation label: ${label}`);
  assert.match(ui, /dataSection|dataset\.section|data-section/);
  assert.match(ui, /campusPanel/);
  assert.match(ui, /policiesPanel/);
});

test('Policies documents production, access, tenant and AI rules', () => {
  for (const contract of [
    'Production', 'Access', 'Clients', 'AI Actions', 'Deployment', 'Incidents',
    'Code → Test → Deploy → Production Verify → Audit Log',
  ]) assert.ok(ui.includes(contract), `missing policy contract: ${contract}`);
});

test('compact layer reduces dashboard spacing without altering core auth', () => {
  assert.match(css, /grid-template-columns:220px/);
  assert.match(css, /topbar\{height:70px/);
  assert.match(css, /content\{max-width:none;padding:18px 22px 34px/);
  assert.match(css, /policy-grid/);
  assert.match(css, /campus-layout/);
  assert.doesNotMatch(ui, /\/api\/google\/login|\/api\/login/);
});

test('production build injects compact assets after existing access modules', () => {
  assert.match(build, /admin-compact\.css/);
  assert.match(build, /admin-compact\.js/);
  assert.ok(build.indexOf('google-admin-auth.js') < build.lastIndexOf('admin-compact.js'));
});
