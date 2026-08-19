import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const loader = await read('admin-demand-loader.js');
const features = await read('control-center-features.js');
const postbuild = await read('scripts/admin-performance-postbuild.mjs');
const shell = await read('admin-authenticated-shell.js');

test('advanced admin destinations remain visible as lightweight demand placeholders', () => {
  for (const section of ['clients','admins','community','books','social','affiliates']) {
    assert.match(loader, new RegExp(`${section}:`));
  }
  assert.match(loader, /data\.demandAdvanced/);
  assert.match(loader, /installAdvancedPlaceholders/);
  assert.match(loader, /activateAdvanced/);
});

test('advanced catalog wakes only after an advanced destination is clicked', () => {
  assert.match(loader, /advancedBootstrap \|\|= loadScript\('control-center-features\.js'\)/);
  assert.match(loader, /removeAdvancedPlaceholders\(\)/);
  assert.match(loader, /waitFor\(`\[data-section="\$\{section\}"\], \[data-lazy-section="\$\{section\}"\]`\)/);
  assert.doesNotMatch(shell, /'control-center-features\.js'/);
});

test('the historical advanced catalog still owns real feature modules', () => {
  for (const marker of ['loadClients','loadAdmins','loadCommunity','loadBooks','loadSocial','loadAffiliates']) assert.match(features, new RegExp(marker));
  assert.match(features, /loadModule\('books-admin\.js'\)/);
  assert.match(features, /loadModule\('client-access\.js'\)/);
});

test('normal fast path prevents the advanced catalog from adding a second Finance loader', () => {
  assert.match(postbuild, /if \(!window\.EKODIAdminDemand\)/);
  assert.match(postbuild, /Advanced catalog could duplicate Finance lazy loading/);
});
