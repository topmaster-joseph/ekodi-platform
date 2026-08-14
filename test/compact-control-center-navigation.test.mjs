import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ui = await readFile(new URL('../compact-control-center.js', import.meta.url), 'utf8');

test('all Control Center navigation labels are English', () => {
  const labels = [
    'Campus', 'Operations', 'Services', 'Clients', 'Admin Accounts', 'Finance', 'Mail & Live',
    'Cloud & Files', 'Organization', 'Domains & DNS', 'Policies', 'Activity Logs', 'Logout',
  ];
  for (const label of labels) assert.ok(ui.includes(label), `${label} must be present`);
});
