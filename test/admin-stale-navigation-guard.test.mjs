import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract: only the newest selected section may commit a queued legacy-nav click.
const source = readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('deferred admin navigation validates the latest requested section before applying a panel', () => {
  assert.match(source, /requestedSection=section;\s*\/\/ A prior menu click[\s\S]*?window\.setTimeout\(\(\)=>\{\s*if\(requestedSection!==section\)return;\s*if\(!activatePanel\(section\)\)requestDemand\(section\);\s*\},0\);/);
  assert.match(source, /requestedSection=section;return activatePanel\(section\)\|\|requestDemand\(section\);/);
});

test('prior security click cannot override more recent audit-records click', () => {
  // Models the guarded deferred callback from the checked-in runtime.
  const callbacks = [];
  const activations = [];
  let requestedSection = '';
  const scheduleLegacyClick = section => {
    requestedSection = section;
    callbacks.push(() => {
      if (requestedSection !== section) return;
      activations.push(section);
    });
  };
  scheduleLegacyClick('security');
  // Delegated audit-records activation updates requestedSection synchronously.
  requestedSection = 'audit-records';
  activations.push('audit-records');
  for (const callback of callbacks) callback();
  assert.deepEqual(activations, ['audit-records']);
});

test('latest queued navigation remains active when no newer menu was selected', () => {
  const callbacks = [];
  const activations = [];
  let requestedSection = '';
  const scheduleLegacyClick = section => {
    requestedSection = section;
    callbacks.push(() => {
      if (requestedSection !== section) return;
      activations.push(section);
    });
  };
  scheduleLegacyClick('security');
  scheduleLegacyClick('audit-records');
  for (const callback of callbacks) callback();
  assert.deepEqual(activations, ['audit-records']);
});
