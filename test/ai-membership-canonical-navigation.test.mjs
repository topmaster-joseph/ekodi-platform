import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../user-ai-tier-panel.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');

test('AI membership visible activation synchronizes canonical Admin current section',()=>{
  const show = panel.slice(panel.indexOf('  function showSection() {'), panel.indexOf('  function installNav() {'));
  assert.ok(show.startsWith('  function showSection() {'));
  assert.match(show,/EKODIAdminPanels\?\.current\?\.\(\) !== SECTION/);
  assert.match(show,/EKODIAdminPanels\?\.activate\?\.\(SECTION\)/);
  assert.ok(show.indexOf('EKODIAdminPanels?.activate?.(SECTION)') < show.indexOf("document.querySelectorAll('[data-panel]')"));
  assert.match(show,/node\.hidden = !visible/);
  assert.match(show,/location\.hash !== '#ai-membership'/);
});

test('canonical router activation is guarded against redundant membership navigation',()=>{
  assert.match(shell,/current:\(\)=>requestedSection/);
  assert.match(shell,/activate:section=>/);
  const show = panel.slice(panel.indexOf('  function showSection() {'), panel.indexOf('  function installNav() {'));
  assert.match(show,/if \(window\.EKODIAdminPanels\?\.current\?\.\(\) !== SECTION\) \{/);
  assert.doesNotMatch(show,/route\.fulfill|authenticated:\s*true|return true;\s*\/\/ bypass/);
});

test('membership nav still offers a direct visible click and an actual panel',()=>{
  assert.match(panel,/button\.addEventListener\('click', event => \{ event\.preventDefault\(\); event\.stopPropagation\(\); showSection\(\); \}\)/);
  assert.match(panel,/section\.dataset\.panel = SECTION/);
  assert.match(panel,/section\.hidden = true/);
});

test('AI membership lazy loader waits for the actual panel before signaling readiness',()=>{
  assert.match(loader,/aimembers:\\s*\\{/);
  assert.match(loader,/ready: '#userAiMembershipPanel'/);
  assert.match(loader,/real: '\\[data-section="ai-membership"\\]'/);
  assert.match(panel,/section\\.id = PANEL_ID/);
});
