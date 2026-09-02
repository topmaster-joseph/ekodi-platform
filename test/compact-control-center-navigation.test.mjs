import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_MENU_GROUPS, ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';

test('current Admin navigation exposes the eight canonical work areas in English', () => {
  const groupLabels = ADMIN_MENU_GROUPS.map(group => group.labels.en);
  assert.deepEqual(groupLabels, [
    'Home', 'Operations', 'People & Spaces', 'Services',
    'AI & Automation', 'Business', 'Data', 'System'
  ]);
});

test('current visible subservices use registry-owned English labels', () => {
  const labels = ADMIN_MENU_REGISTRY.filter(item => !item.internal).map(item => item.labels.en);
  for (const label of ['Site Management', 'Work', 'Customer Sites', 'Finance & Accounting', 'Storage', 'System Health']) {
    assert.ok(labels.includes(label), `${label} must be present`);
  }
  assert.ok(ADMIN_MENU_REGISTRY.filter(item => item.internal).some(item => item.id === 'policies'));
});
