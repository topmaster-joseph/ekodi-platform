import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('internal operations stay available to the control plane but disappear from primary navigation', () => {
  for (const section of ['overview', 'services', 'deployments', 'policies']) {
    assert.match(layout, new RegExp(`['\"]${section}['\"]`));
  }
  assert.match(layout, /INTERNAL_ONLY_HREFS/);
  assert.match(layout, /\/legacy#domains/);
  assert.match(layout, /\/legacy#activity/);
  assert.match(layout, /item\.hidden = true/);
  assert.match(layout, /data\.aiInternal|dataset\.aiInternal/);
});

test('AI Ops is the human-facing fallback for retired Operations and Services views', () => {
  assert.match(layout, /preferredHumanSection/);
  assert.match(layout, /hasPanel\('aiops'\)/);
  assert.match(layout, /openAiOpsFromInternalRequest/);
  assert.match(layout, /#ai-ops/);
  assert.match(layout, /\['#operations', 'overview'\]/);
  assert.match(layout, /\['#services', 'services'\]/);
});

test('Devices participates in the central panel router even though its menu is installed dynamically', () => {
  assert.match(layout, /deviceControlNav/);
  assert.match(layout, /return 'devices'/);
  assert.match(layout, /\.nav\[data-device-control-nav\]/);
});

test('Campus shortcuts cannot reopen hidden operational panels', () => {
  assert.match(layout, /\[data-campus-section\]/);
  assert.match(layout, /control\.dataset\.campusSection = 'aiops'/);
  assert.match(layout, /AI Ops/);
});
